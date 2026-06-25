"""Standalone CLI entry point for the admin testing console — calls the real
extract_text()/chunk_text() from main.py directly, bypassing Flask and GCS."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.main import chunk_text, extract_text  # noqa: E402


def main() -> None:
    file_path = Path(sys.argv[1])
    document_id = sys.argv[2] if len(sys.argv) > 2 else "sandbox-doc"
    file_bytes = file_path.read_bytes()

    text, used_docling = extract_text(file_bytes, document_id)
    chunks = chunk_text(text, document_id, used_docling)

    json.dump({"used_docling": used_docling, "text": text, "chunks": chunks}, sys.stdout)


if __name__ == "__main__":
    main()
