"""Unit tests for scraper doc type classification."""

import unittest

from src.doc_types import classify_doc_type, is_target_doc_type


class TestDocTypes(unittest.TestCase):
    def test_classify_agenda(self):
        self.assertEqual(classify_doc_type("https://example.gov/agenda-2024.pdf"), "agenda")

    def test_classify_packet(self):
        self.assertEqual(classify_doc_type("https://example.gov/staff_report.pdf"), "packet")

    def test_classify_rfp(self):
        self.assertEqual(classify_doc_type("https://example.gov/RFP-water.pdf"), "rfp")

    def test_classify_other(self):
        self.assertEqual(classify_doc_type("https://example.gov/random.pdf"), "other")

    def test_is_target_doc_type(self):
        self.assertTrue(is_target_doc_type("agenda"))
        self.assertTrue(is_target_doc_type("rfp"))
        self.assertFalse(is_target_doc_type("other"))


if __name__ == "__main__":
    unittest.main()
