"""F2 Scraper — downloads government meeting documents to GCS."""

import hashlib
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import aiohttp
from flask import Flask, jsonify, request
from google.cloud import firestore, storage

from src.doc_types import classify_doc_type, is_target_doc_type
from src.errors import StructuralScrapeError
from src.scrapers import extract_embedded_links, scrape_for_strategy

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MOCK_MODE = os.getenv("MOCK_MODE", "false").lower() == "true"
GCS_BUCKET = os.getenv("GCS_RAW_BUCKET", "beaver-raw-documents")
FS_COUNTIES = "counties"
CIRCUIT_BREAKER_THRESHOLD = int(os.getenv("CIRCUIT_BREAKER_THRESHOLD", "3"))
CIRCUIT_BREAKER_COOLDOWN_HOURS = int(os.getenv("CIRCUIT_BREAKER_COOLDOWN_HOURS", "24"))

app = Flask(__name__)


def content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def document_id(county_id: str, hash_hex: str) -> str:
    return f"doc-{county_id}-{hash_hex[:16]}"


async def download_url(session: aiohttp.ClientSession, url: str) -> bytes:
    async with session.get(url, timeout=aiohttp.ClientTimeout(total=60)) as resp:
        resp.raise_for_status()
        return await resp.read()


# File signatures for the document types we follow embedded links into.
# PDF: %PDF-. Office (docx/pptx/xlsx) and legacy .doc/.ppt/.xls binaries are
# both real attachment formats seen in real Legistar packets (DEBUG-LOG.md).
_DOCUMENT_SIGNATURES = (b"%PDF-", b"PK\x03\x04", b"\xd0\xcf\x11\xe0")
_CONTENT_TYPES = {
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "ppt": "application/vnd.ms-powerpoint",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _looks_like_document(data: bytes) -> bool:
    """Some servers 200 OK with the right content-type but stall mid-stream,
    returning a truncated/garbage body (see DEBUG-LOG.md). Check the file
    signature before trusting a download is real."""
    return any(data.startswith(sig) for sig in _DOCUMENT_SIGNATURES)


async def scrape_crawl4ai_mock(source_urls: list[str]) -> list[dict[str, Any]]:
    return [{"url": u, "title": "mock-agenda.pdf"} for u in source_urls]


async def process_scrape_job(job: dict[str, Any]) -> dict[str, Any]:
    county_id = job["county_id"]
    strategy = job.get("scraper_strategy", "crawl4ai")
    source_urls = job["source_urls"]
    platform = job.get("platform")
    timezone = job.get("timezone")
    trace_id = job.get("trace_id", str(uuid4()))

    if MOCK_MODE:
        links = await scrape_crawl4ai_mock(source_urls)
    else:
        links = await scrape_for_strategy(strategy, source_urls, platform, county_id, timezone)

    uploaded: list[str] = []
    seen_hashes: set[str] = set()

    async with aiohttp.ClientSession() as session:
        for item in links:
            url = item["url"]
            doc_type = classify_doc_type(url, item.get("title", ""))
            if not is_target_doc_type(doc_type):
                continue

            try:
                if MOCK_MODE:
                    data = b"mock-pdf-content"
                else:
                    data = await download_url(session, url)
                    if not _looks_like_document(data):
                        logger.warning(
                            "Download %s did not return a valid document (%d bytes) — skipping",
                            url, len(data),
                        )
                        continue

                hash_hex = content_hash(data)
                if hash_hex in seen_hashes:
                    continue
                seen_hashes.add(hash_hex)

                doc_id = document_id(county_id, hash_hex)
                gcs_path = f"{county_id}/{doc_id}/{doc_id}.pdf"

                if not MOCK_MODE:
                    client = storage.Client()
                    bucket = client.bucket(GCS_BUCKET)
                    blob = bucket.blob(gcs_path)
                    blob.upload_from_string(data, content_type="application/pdf")
                    blob.metadata = {
                        "county_id": county_id,
                        "document_id": doc_id,
                        "content_hash": hash_hex,
                        "doc_type": doc_type,
                        "trace_id": trace_id,
                    }
                    blob.patch()

                if not MOCK_MODE and doc_type in {"agenda", "packet", "minutes"}:
                    # Real agendas/packets typically link out to the actual
                    # attachment documents (e.g. Legistar's
                    # gateway.aspx?M=F&ID=...pdf) rather than embedding the
                    # content directly — without following these, we only
                    # ever see the thin agenda shell, never the substantive
                    # ordinance/staff-report/RFP text (see DEBUG-LOG.md).
                    for embedded_url in extract_embedded_links(data):
                        try:
                            embedded_data = await download_url(session, embedded_url)
                            if not _looks_like_document(embedded_data):
                                logger.warning(
                                    "Embedded link %s did not return a valid document (%d bytes) — skipping",
                                    embedded_url, len(embedded_data),
                                )
                                continue
                            embedded_hash = content_hash(embedded_data)
                            if embedded_hash in seen_hashes:
                                continue
                            seen_hashes.add(embedded_hash)
                            embedded_id = document_id(county_id, embedded_hash)
                            embedded_doc_type = classify_doc_type(embedded_url)
                            embedded_ext = embedded_url.split("?")[0].rsplit(".", 1)[-1].lower()
                            embedded_path = f"{county_id}/{embedded_id}/{embedded_id}.{embedded_ext}"
                            bucket = storage.Client().bucket(GCS_BUCKET)
                            blob = bucket.blob(embedded_path)
                            blob.upload_from_string(embedded_data, content_type=_CONTENT_TYPES.get(embedded_ext, "application/octet-stream"))
                            blob.metadata = {
                                "county_id": county_id,
                                "document_id": embedded_id,
                                "content_hash": embedded_hash,
                                "doc_type": embedded_doc_type,
                                "trace_id": trace_id,
                                "source_document_id": doc_id,
                            }
                            blob.patch()
                            uploaded.append(embedded_id)
                        except Exception as e:
                            logger.warning("Embedded document download failed for %s: %s", embedded_url, e)

                uploaded.append(doc_id)
            except Exception as e:
                logger.error("Document download failed for %s: %s", url, e)

    return {
        "trace_id": trace_id,
        "county_id": county_id,
        "uploaded_document_ids": uploaded,
        "count": len(uploaded),
    }


def mark_county_broken(county_id: str, error: str) -> None:
    if MOCK_MODE:
        logger.info("[MOCK] Would mark county %s broken: %s", county_id, error)
        return

    db = firestore.Client(database=os.getenv("FIRESTORE_DATABASE", "(default)"))
    ref = db.collection(FS_COUNTIES).document(county_id)
    doc = ref.get()
    data = doc.to_dict() or {}
    failure_count = int(data.get("failure_count", 0)) + 1
    updates: dict[str, Any] = {
        "failure_count": failure_count,
        "last_error": error[:500],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if failure_count >= CIRCUIT_BREAKER_THRESHOLD:
        broken_until = datetime.now(timezone.utc) + timedelta(hours=CIRCUIT_BREAKER_COOLDOWN_HOURS)
        updates["broken"] = True
        updates["broken_until"] = broken_until.isoformat()
    ref.set(updates, merge=True)


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "beaver-scraper"})


@app.post("/")
def handle_pubsub():
    envelope = request.get_json(silent=True) or {}
    county_id = "unknown"
    try:
        if envelope.get("message", {}).get("data"):
            raw = envelope["message"]["data"]
            job = json.loads(__import__("base64").b64decode(raw).decode("utf-8"))
        else:
            job = envelope

        county_id = job.get("county_id", "unknown")

        import asyncio
        result = asyncio.run(process_scrape_job(job))
        logger.info("Scrape job complete: %s", result)
        return jsonify(result), 200
    except StructuralScrapeError as e:
        logger.exception("Structural scrape failure for county %s", county_id)
        mark_county_broken(county_id, str(e))
        return jsonify({"error": str(e), "structural": True}), 500
    except Exception as e:
        logger.exception("Scrape job failed")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
