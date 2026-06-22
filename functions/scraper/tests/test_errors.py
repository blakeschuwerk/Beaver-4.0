"""Unit tests for scraper structural errors."""

import unittest

from src.errors import (
    StructuralScrapeError,
    is_structural_http_error,
    raise_if_structural_http,
)


class TestStructuralErrors(unittest.TestCase):
    def test_is_structural_http_error(self):
        self.assertTrue(is_structural_http_error(404))
        self.assertTrue(is_structural_http_error(410))
        self.assertFalse(is_structural_http_error(500))

    def test_raise_if_structural_http(self):
        with self.assertRaises(StructuralScrapeError):
            raise_if_structural_http(404, "https://example.gov", "test-county")

    def test_no_raise_on_success(self):
        raise_if_structural_http(200, "https://example.gov")


if __name__ == "__main__":
    unittest.main()
