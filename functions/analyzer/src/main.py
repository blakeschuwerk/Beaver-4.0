"""F3 Analyzer — Docling extraction + hybrid parent/child chunking."""

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from flask import Flask, jsonify, request
from google.cloud import storage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MOCK_MODE = os.getenv("MOCK_MODE", "false").lower() == "true"
GCS_RAW_BUCKET = os.getenv("GCS_RAW_BUCKET", "beaver-raw-documents")
GCS_STAGING_BUCKET = os.getenv("GCS_STAGING_BUCKET", "beaver-staging-extracted")

# TODO: Discovery Engine API integration is UNRESOLVED — purpose never determined.
# Do not build functionality around it until product direction is clear.
# Staging GCS bucket may eventually feed Discovery Engine for search/RAG.

app = Flask(__name__)


def extract_with_docling(file_bytes: bytes, filename: str) -> str:
    """Extract text using Docling when available."""
    try:
        from docling.document_converter import DocumentConverter  # type: ignore
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        converter = DocumentConverter()
        result = converter.convert(tmp_path)
        return result.document.export_to_markdown()
    except ImportError:
        logger.warning("Docling not installed — using mock text extraction")
        return extract_mock_text(file_bytes)


def extract_mock_text(file_bytes: bytes) -> str:
    return (
        "Mock extracted text for municipal infrastructure project. "
        "Tracking Number: CIP-2024-042. "
        "Estimated budget $2.5M for roadway resurfacing and drainage improvements. "
        "Subcommittee agenda item regarding capital improvement plan allocation."
    )


def hybrid_chunk(text: str, document_id: str) -> list[dict[str, Any]]:
    """Parent/child hybrid chunking — parent sections, child paragraphs."""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if not paragraphs:
        paragraphs = [text]

    chunks: list[dict[str, Any]] = []
    parent_id = f"{document_id}-parent-0"
    chunks.append({
        "chunk_id": parent_id,
        "parent_chunk_id": None,
        "text": text[:2000],
        "chunk_type": "parent",
    })

    for i, para in enumerate(paragraphs[:50]):
        if len(para) < 40:
            continue
        chunks.append({
            "chunk_id": f"{document_id}-child-{i}",
            "parent_chunk_id": parent_id,
            "text": para,
            "chunk_type": "child",
        })

    return chunks


def process_document(message: dict[str, Any]) -> dict[str, Any]:
    gcs_uri = message.get("gcs_uri", "")
    document_id = message["document_id"]
    county_id = message["county_id"]
    trace_id = message.get("trace_id", str(uuid4()))

    if MOCK_MODE:
        file_bytes = b"mock"
        blob_path = f"{county_id}/{document_id}/extracted.json"
    else:
        # Parse gs://bucket/path
        parts = gcs_uri.replace("gs://", "").split("/", 1)
        bucket_name = parts[0]
        blob_path_raw = parts[1] if len(parts) > 1 else f"{county_id}/{document_id}"

        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_path_raw)
        file_bytes = blob.download_as_bytes()

    text = extract_with_docling(file_bytes, document_id)
    chunks = hybrid_chunk(text, document_id)

    output = {
        "document_id": document_id,
        "county_id": county_id,
        "trace_id": trace_id,
        "extracted_at": datetime.now(timezone.utc).isoformat(),
        "chunk_count": len(chunks),
        "chunks": chunks,
        "content_hash": message.get("content_hash"),
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
