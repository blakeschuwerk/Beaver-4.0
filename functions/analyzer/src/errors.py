"""Analyzer error types — mirrors functions/scraper/src/errors.py's convention."""


class DoclingExtractionError(Exception):
    """Raised when real Docling extraction fails and MOCK_MODE is not explicitly
    enabled. Per CLAUDE.md's Failure & Observability Principles, a failed
    dependency must fail visibly — never silently substitute fake text for a
    real document (see DEBUG-LOG.md)."""

    def __init__(self, message: str, document_id: str | None = None):
        super().__init__(message)
        self.document_id = document_id
