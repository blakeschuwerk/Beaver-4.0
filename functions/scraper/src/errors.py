"""Scraper error types for circuit-breaker routing."""


class StructuralScrapeError(Exception):
    """Raised when a county site structure changed or is unreachable (404, empty roster, etc.)."""

    def __init__(self, message: str, county_id: str | None = None, url: str | None = None):
        super().__init__(message)
        self.county_id = county_id
        self.url = url


def is_structural_http_error(status_code: int) -> bool:
    """HTTP statuses that indicate a broken or moved county site."""
    return status_code in {404, 410, 451}


def raise_if_structural_http(status_code: int, url: str, county_id: str | None = None) -> None:
    if is_structural_http_error(status_code):
        raise StructuralScrapeError(
            f"Structural HTTP {status_code} for {url}",
            county_id=county_id,
            url=url,
        )
