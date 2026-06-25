"""Standalone CLI entry point for the admin testing console — calls the real
extract_text()/chunk_text() from main.py directly, bypassing Flask and GCS.

Extraction (Docling) is the dominant cost of a sandbox run — ~100s+ for a
single agenda PDF, dwarfing every LLM call combined. Since chunking-rule
changes don't touch extraction at all, cache extract_text()'s output on disk
keyed by file content hash. Re-running the same test PDF skips the expensive
Docling pass and always re-chunks fresh against current chunking.py code, so
chunking iteration drops from ~2min to <1s. Set SANDBOX_NO_CACHE=true to force
a fresh extraction (e.g. after changing Docling extraction logic itself).
"""

import hashlib
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.main import chunk_text, extract_text  # noqa: E402

CACHE_DIR = Path(__file__).resolve().parent.parent.parent.parent / "local-run" / "extract-cache"


def _cache_path(file_bytes: bytes) -> Path:
    digest = hashlib.sha256(file_bytes).hexdigest()[:16]
    return CACHE_DIR / f"{digest}.json"


def _cached_extract(file_bytes: bytes, document_id: str) -> tuple[str, bool]:
    if os.getenv("SANDBOX_NO_CACHE", "").lower() == "true":
        return extract_text(file_bytes, document_id)

    cache_path = _cache_path(file_bytes)
    if cache_path.exists():
        cached = json.loads(cache_path.read_text())
        return cached["text"], cached["used_docling"]

    text, used_docling = extract_text(file_bytes, document_id)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps({"text": text, "used_docling": used_docling}))
    return text, used_docling


def main() -> None:
    file_path = Path(sys.argv[1])
    document_id = sys.argv[2] if len(sys.argv) > 2 else "sandbox-doc"
    file_bytes = file_path.read_bytes()

    text, used_docling = _cached_extract(file_bytes, document_id)
    chunks = chunk_text(text, document_id, used_docling)

    json.dump({"used_docling": used_docling, "text": text, "chunks": chunks}, sys.stdout)


if __name__ == "__main__":
    main()
