"""F3 Analyzer — Docling extraction + hybrid parent/child chunking."""

import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from flask import Flask, jsonify, request
from google.cloud import storage

from src.chunking import hybrid_chunk, hybrid_chunk_from_markdown
from src.errors import DoclingExtractionError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MOCK_MODE = os.getenv("MOCK_MODE", "false").lower() == "true"
USE_DOCLING = os.getenv("USE_DOCLING", "false").lower() == "true"
GCS_RAW_BUCKET = os.getenv("GCS_RAW_BUCKET", "beaver-raw-documents")
GCS_STAGING_BUCKET = os.getenv("GCS_STAGING_BUCKET", "beaver-staging-extracted")

# TODO: Discovery Engine API integration is UNRESOLVED — purpose never determined.
# Do not build functionality around it until product direction is clear.

app = Flask(__name__)


def extract_mock_text(_file_bytes: bytes) -> str:
    return (
        "Mock extracted text for municipal infrastructure project. "
        "Tracking Number: CIP-2024-042. "
        "Estimated budget $2.5M for roadway resurfacing and drainage improvements. "
        "Subcommittee agenda item regarding capital improvement plan allocation."
    )


def extract_with_docling(file_bytes: bytes, filename: str) -> str:
    """Extract text using Docling when installed."""
    from docling.document_converter import DocumentConverter  # type: ignore

    suffix = ".pdf" if filename.endswith(".pdf") else ".pdf"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    converter = DocumentConverter()
    result = converter.convert(tmp_path)
    return result.document.export_to_markdown()


def extract_text(file_bytes: bytes, filename: str) -> tuple[str, bool]:
    """Return (text, used_docling).

    Mock fallback is a local-dev convenience gated on MOCK_MODE=true — see
    CLAUDE.md "Failure & Observability Principles". With MOCK_MODE off, a
    failed Docling extraction must fail loud (DoclingExtractionError) rather
    than silently writing fabricated text into the pipeline (see DEBUG-LOG.md:
    a corrupted/undownloadable PDF previously triggered this fallback silently).
    """
    if USE_DOCLING:
        try:
            text = extract_with_docling(file_bytes, filename)
            return text, True
        except ImportError as e:
            if MOCK_MODE:
                logger.warning("USE_DOCLING=true but docling not installed — using mock extraction")
                return extract_mock_text(file_bytes), False
            raise DoclingExtractionError(
                f"docling not installed for {filename}: {e}", document_id=filename,
            ) from e
        except Exception as e:
            if MOCK_MODE:
                logger.warning("Docling extraction failed (%s) — using mock extraction", e)
                return extract_mock_text(file_bytes), False
            raise DoclingExtractionError(
                f"Docling extraction failed for {filename}: {e}", document_id=filename,
            ) from e

    if not MOCK_MODE:
        raise DoclingExtractionError(
            f"USE_DOCLING is disabled and MOCK_MODE is off — no real extraction path for {filename}",
            document_id=filename,
        )
    return extract_mock_text(file_bytes), False


def chunk_text(text: str, document_id: str, used_docling: bool) -> list[dict[str, Any]]:
    if used_docling:
        return hybrid_chunk_from_markdown(text, document_id)
    return hybrid_chunk(text, document_id)


def process_document(message: dict[str, Any]) -> dict[str, Any]:
    gcs_uri = message.get("gcs_uri", "")
    document_id = message["document_id"]
    county_id = message["county_id"]
    trace_id = message.get("trace_id", str(uuid4()))

    if MOCK_MODE:
        file_bytes = b"mock"
    else:
        parts = gcs_uri.replace("gs://", "").split("/", 1)
        bucket_name = parts[0]
        blob_path_raw = parts[1] if len(parts) > 1 else f"{county_id}/{document_id}"

        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_path_raw)
        file_bytes = blob.download_as_bytes()

    text, used_docling = extract_text(file_bytes, document_id)
    chunks = chunk_text(text, document_id, used_docling)

    output = {
        "document_id": document_id,
        "county_id": county_id,
        "trace_id": trace_id,
        "extracted_at": datetime.now(timezone.utc).isoformat(),
        "chunk_count": len(chunks),
        "chunks": chunks,
        "content_hash": message.get("content_hash"),
        "extraction_method": "docling" if used_docling else "mock",
    }

    staging_path = f"{county_id}/{document_id}/chunks.json"
    if not MOCK_MODE:
        staging_bucket = storage.Client().bucket(GCS_STAGING_BUCKET)
        staging_blob = staging_bucket.blob(staging_path)
        staging_blob.upload_from_string(
            json.dumps(output),
            content_type="application/json",
        )
        staging_blob.metadata = {
            "document_id": document_id,
            "county_id": county_id,
            "chunk_count": str(len(chunks)),
            "trace_id": trace_id,
        }
        staging_blob.patch()

    return {
        "trace_id": trace_id,
        "document_id": document_id,
        "gcs_uri": f"gs://{GCS_STAGING_BUCKET}/{staging_path}",
        "chunk_count": len(chunks),
    }


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "beaver-analyzer"})


def parse_gcs_notification(data: dict) -> dict | None:
    """Transform GCS OBJECT_FINALIZE notification into raw-document message."""
    if "name" in data and "bucket" in data:
        parts = data["name"].split("/")
        metadata = data.get("metadata") or {}
        return {
            "schema_version": "1.0.0",
            "trace_id": str(uuid4()),
            "published_at": datetime.now(timezone.utc).isoformat(),
            "gcs_uri": f"gs://{data['bucket']}/{data['name']}",
            "document_id": metadata.get("document_id", parts[1] if len(parts) > 1 else data["name"]),
            "county_id": metadata.get("county_id", parts[0] if parts else "unknown"),
            "content_hash": metadata.get("content_hash", "unknown"),
            "doc_type": metadata.get("doc_type", "other"),
        }
    return None


@app.post("/")
def handle_pubsub():
    envelope = request.get_json(silent=True) or {}
    try:
        if envelope.get("message", {}).get("data"):
            raw = envelope["message"]["data"]
            parsed = json.loads(__import__("base64").b64decode(raw).decode("utf-8"))
            message = parse_gcs_notification(parsed) or parsed
        else:
            message = envelope

        result = process_document(message)
        logger.info("Analysis complete: %s", result)
        return jsonify(result), 200
    except Exception as e:
        logger.exception("Analyzer failed")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
