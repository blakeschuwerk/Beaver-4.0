"""Document type classification for scraped links."""

import re

ALLOWED_DOC_TYPES = {"agenda", "packet", "minutes"}

DOC_TYPE_PATTERNS = {
    "agenda": re.compile(r"agenda", re.I),
    "packet": re.compile(r"packet|staff[\s_]*report", re.I),
    "minutes": re.compile(r"minutes", re.I),
    "rfp": re.compile(r"\brfp\b|request\s+for\s+proposal", re.I),
    "scope_of_work": re.compile(r"scope\s+of\s+work", re.I),
    "tabulation": re.compile(r"tabulation|bid\s+tab", re.I),
    "bid_roster": re.compile(r"bid\s+roster|sign[\s-]?in", re.I),
}


def classify_doc_type(url: str, title: str = "") -> str:
    text = f"{url} {title}"
    for doc_type, pattern in DOC_TYPE_PATTERNS.items():
        if pattern.search(text):
            return doc_type
    return "other"


def is_target_doc_type(doc_type: str) -> bool:
    return doc_type in ALLOWED_DOC_TYPES or doc_type in {
        "rfp",
        "scope_of_work",
        "tabulation",
        "bid_roster",
    }
