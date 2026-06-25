"""Hybrid parent/child chunking for extracted document text."""

import re
from typing import Any

# Paragraphs below this alphanumeric-character ratio are structural noise
# (underscore signature lines, table-border dashes, etc.) with no content for
# the classifier to reason about — drop them rather than handing the LLM a
# fragment it can only guess at.
MIN_ALNUM_RATIO = 0.3


def _is_heading_paragraph(para: str) -> bool:
    """True if a paragraph is a bare markdown heading line (no body text)."""
    return para.lstrip().startswith("#")


def _is_noise_paragraph(para: str) -> bool:
    """True if a paragraph is mostly punctuation/whitespace (dividers, blank signature lines)."""
    alnum = sum(c.isalnum() for c in para)
    return alnum / max(len(para), 1) < MIN_ALNUM_RATIO


def _emit_children(paragraphs: list[str], parent_id: str, id_prefix: str) -> list[dict[str, Any]]:
    """Build child chunks from paragraphs, merging orphan headings into the
    next paragraph (instead of emitting a context-free heading-only chunk)
    and dropping noise paragraphs entirely."""
    chunks: list[dict[str, Any]] = []
    pending_heading = ""
    child_idx = 0

    for para in paragraphs:
        if _is_heading_paragraph(para):
            pending_heading = f"{pending_heading}\n\n{para}".strip() if pending_heading else para
            continue
        if _is_noise_paragraph(para):
            continue

        merged = f"{pending_heading}\n\n{para}".strip() if pending_heading else para
        pending_heading = ""

        if len(merged) < 40:
            continue

        chunks.append({
            "chunk_id": f"{id_prefix}-{child_idx}",
            "parent_chunk_id": parent_id,
            "text": merged,
            "chunk_type": "child",
        })
        child_idx += 1

    # Trailing orphan heading with nothing after it in the section — no body
    # to merge into, so there's nothing for the classifier to evaluate. Drop it.
    return chunks


def hybrid_chunk(text: str, document_id: str) -> list[dict[str, Any]]:
    """Parent/child hybrid chunking — parent sections, child paragraphs."""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if not paragraphs:
        paragraphs = [text]

    parent_id = f"{document_id}-parent-0"
    chunks: list[dict[str, Any]] = [{
        "chunk_id": parent_id,
        "parent_chunk_id": None,
        "text": text[:2000],
        "chunk_type": "parent",
    }]

    chunks.extend(_emit_children(paragraphs[:50], parent_id, f"{document_id}-child"))
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
        chunks.extend(_emit_children(paragraphs, parent_id, f"{document_id}-child-{section_idx}"))

    return chunks if len(chunks) > 1 else hybrid_chunk(text, document_id)
