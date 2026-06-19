"""F2 Scraper — downloads government meeting documents to GCS."""

import hashlib
import json
import logging
import os
import re
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

import aiohttp
import fitz  # PyMuPDF
from flask import Flask, jsonify, request
from google.cloud import firestore, storage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MOCK_MODE = os.getenv("MOCK_MODE", "false").lower() == "true"
GCS_BUCKET = os.getenv("GCS_RAW_BUCKET", "beaver-raw-documents")
FS_COUNTIES = "counties"
CIRCUIT_BREAKER_THRESHOLD = int(os.getenv("CIRCUIT_BREAKER_THRESHOLD", "3"))
CIRCUIT_BREAKER_COOLDOWN_HOURS = int(os.getenv("CIRCUIT_BREAKER_COOLDOWN_HOURS", "24"))

ALLOWED_DOC_TYPES = {"agenda", "packet", "minutes"}
DOC_TYPE_PATTERNS = {
    "agenda": re.compile(r"agenda", re.I),
    "packet": re.compile(r"packet|staff\s*report", re.I),
    "minutes": re.compile(r"minutes", re.I),
    "rfp": re.compile(r"\brfp\b|request\s+for\s+proposal", re.I),
    "scope_of_work": re.compile(r"scope\s+of\s+work", re.I),
    "tabulation": re.compile(r"tabulation|bid\s+tab", re.I),
    "bid_roster": re.compile(r"bid\s+roster|sign[\s-]?in", re.I),
}

app = Flask(__name__)


def classify_doc_type(url: str, title: str = "") -> str:
    text = f"{url} {title}"
    for doc_type, pattern in DOC_TYPE_PATTERNS.items():
        if pattern.search(text):
            return doc_type
    return "other"


def is_target_doc_type(doc_type: str) -> bool:
    return doc_type in ALLOWED_DOC_TYPES or doc_type in {"rfp", "scope_of_work", "tabulation", "bid_roster"}


def content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def document_id(county_id: str, hash_hex: str) -> str:
    return f"doc-{county_id}-{hash_hex[:16]}"


async def download_url(session: aiohttp.ClientSession, url: str) -> bytes:
    async with session.get(url, timeout=aiohttp.ClientTimeout(total=60)) as resp:
        resp.raise_for_status()
        return await resp.read()


def extract_pdf_links(pdf_bytes: bytes) -> list[str]:
    links: list[str] = []
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        for page in doc:
            for link in page.get_links():
                uri = link.get("uri")
                if uri and uri.startswith("http"):
                    links.append(uri)
    return links


async def scrape_civic_scraper(source_urls: list[str]) -> list[dict[str, Any]]:
    """Route to civic-scraper when platform is known."""
    # TODO: integrate civic-scraper library when installed
    logger.info("civic_scraper path — using link extraction fallback until library wired")
    return await scrape_crawl4ai(source_urls)


async def scrape_crawl4ai(source_urls: list[str]) -> list[dict[str, Any]]:
    """Generic link extraction fallback."""
    # TODO: integrate crawl4ai when installed; current implementation uses aiohttp heuristics
    documents: list[dict[str, Any]] = []
    async with aiohttp.ClientSession() as session:
        for url in source_urls:
            try:
                html = await download_url(session, url)
                text = html.decode("utf-8", errors="ignore")
                pdf_links = re.findall(r'href=["\']([^"\']+\.pdf[^"\']*)["\']', text, re.I)
                for link in pdf_links[:20]:
                    full_url = link if link.startswith("http") else url.rstrip("/") + "/" + link.lstrip("/")
                    documents.append({"url": full_url, "title": link})
            except Exception as e:
                logger.warning("Failed to crawl %s: %s", url, e)
    return documents


async def scrape_crawl4ai_mock(source_urls: list[str]) -> list[dict[str, Any]]:
    return [{"url": u, "title": "mock-agenda.pdf"} for u in source_urls]


async def process_scrape_job(job: dict[str, Any]) -> dict[str, Any]:
    county_id = job["county_id"]
    strategy = job.get("scraper_strategy", "crawl4ai")
    source_urls = job["source_urls"]
    trace_id = job.get("trace_id", str(uuid4()))

    if MOCK_MODE:
        links = await scrape_crawl4ai_mock(source_urls)
    elif strategy == "civic_scraper":
        links = await scrape_civic_scraper(source_urls)
    else:
        links = await scrape_crawl4ai(source_urls)

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

                # Follow PDF embedded links
                if not MOCK_MODE and doc_type in ALLOWED_DOC_TYPES:
                    for embedded_url in extract_pdf_links(data)[:5]:
                        try:
                            embedded_data = await download_url(session, embedded_url)
                            embedded_hash = content_hash(embedded_data)
                            if embedded_hash in seen_hashes:
                                continue
                            seen_hashes.add(embedded_hash)
                            embedded_id = document_id(county_id, embedded_hash)
                            embedded_path = f"{county_id}/{embedded_id}/{embedded_id}.pdf"
                            bucket = storage.Client().bucket(GCS_BUCKET)
                            blob = bucket.blob(embedded_path)
                            blob.upload_from_string(embedded_data, content_type="application/pdf")
                            uploaded.append(embedded_id)
                        except Exception as e:
                            logger.warning("Embedded PDF download failed: %s", e)

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

    db = firestore.Client()
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
    try:
        if envelope.get("message", {}).get("data"):
            raw = envelope["message"]["data"]
            job = json.loads(__import__("base64").b64decode(raw).decode("utf-8"))
        else:
            job = envelope

        import asyncio
        result = asyncio.run(process_scrape_job(job))
        logger.info("Scrape job complete: %s", result)
        return jsonify(result), 200
    except Exception as e:
        county_id = envelope.get("county_id") or "unknown"
        logger.exception("Scrape job failed")
        if "structural" in str(e).lower() or "404" in str(e):
            mark_county_broken(county_id, str(e))
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
