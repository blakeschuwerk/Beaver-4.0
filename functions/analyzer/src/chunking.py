"""Hybrid parent/child chunking for extracted document text."""

import re
from typing import Any


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


def hybrid_chunk_from_markdown(text: str, document_id: str) -> list[dict[str, Any]]:
    """Build parent chunks per markdown heading section, child chunks per paragraph."""
    sections = re.split(r"(?=^#{1,3}\s)", text, flags=re.MULTILINE)
    sections = [s.strip() for s in sections if s.strip()]

    if not sections:
        return hybrid_chunk(text, document_id)

    chunks: list[dict[str, Any]] = []
    for section_idx, section in enumerate(sections[:20]):
        lines = section.splitlines()
        heading = lines[0] if lines else f"Section {section_idx}"
        parent_id = f"{document_id}-parent-{section_idx}"
        chunks.append({
            "chunk_id": parent_id,
            "parent_chunk_id": None,
            "text": section[:2000],
            "chunk_type": "parent",
            "heading": heading.lstrip("#").strip(),
        })

        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", section) if p.strip()]
        child_idx = 0
        for para in paragraphs:
            if len(para) < 40:
                continue
            chunks.append({
                "chunk_id": f"{document_id}-child-{section_idx}-{child_idx}",
                "parent_chunk_id": parent_id,
                "text": para,
                "chunk_type": "child",
            })
            child_idx += 1

    return chunks if len(chunks) > 1 else hybrid_chunk(text, document_id)
