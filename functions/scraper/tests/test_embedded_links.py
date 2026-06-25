"""Tests for extract_embedded_links() — see DEBUG-LOG.md on why embedded
links need following at all: real agenda PDFs link out to the actual
attachment documents instead of embedding the content directly."""

import unittest

import fitz

from src.scrapers import extract_embedded_links


def _make_pdf_with_links(uris: list[str]) -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    rect = fitz.Rect(0, 0, 100, 20)
    for uri in uris:
        page.insert_link({"kind": fitz.LINK_URI, "from": rect, "uri": uri})
    data = doc.tobytes()
    doc.close()
    return data


class TestExtractEmbeddedLinks(unittest.TestCase):
    def test_real_document_links_pass_filter(self):
        pdf = _make_pdf_with_links([
            "https://pima.legistar.com/gateway.aspx?M=F&ID=abc123.pdf",
            "https://milwaukeecounty.legistar.com/gateway.aspx?M=F&ID=def456.pptx",
        ])
        links = extract_embedded_links(pdf)
        self.assertEqual(len(links), 2)
        self.assertTrue(any(l.endswith(".pdf") for l in links))
        self.assertTrue(any(l.endswith(".pptx") for l in links))

    def test_meeting_and_nav_links_are_excluded(self):
        pdf = _make_pdf_with_links([
            "https://sonomacounty.zoom.us/j/85130457116?pwd=abc",
            "https://teams.microsoft.com/meet/29575731763938",
            "https://sonoma-county.legistar.com/Calendar.aspx",
            "https://sonomacounty.ca.gov/Board-of-Supervisors",
        ])
        links = extract_embedded_links(pdf)
        self.assertEqual(links, [])

    def test_keyword_match_without_extension_is_included(self):
        pdf = _make_pdf_with_links([
            "https://example.gov/DisplayAgendaPDF.ashx?MinutesMeetingID=1898",
        ])
        links = extract_embedded_links(pdf)
        self.assertEqual(len(links), 1)

    def test_duplicate_links_are_deduped(self):
        pdf = _make_pdf_with_links([
            "https://example.gov/packet.pdf",
            "https://example.gov/packet.pdf",
        ])
        links = extract_embedded_links(pdf)
        self.assertEqual(len(links), 1)

    def test_limit_is_respected(self):
        uris = [f"https://example.gov/packet-{i}.pdf" for i in range(30)]
        pdf = _make_pdf_with_links(uris)
        links = extract_embedded_links(pdf, limit=5)
        self.assertEqual(len(links), 5)

    def test_no_links_returns_empty_list(self):
        pdf = _make_pdf_with_links([])
        links = extract_embedded_links(pdf)
        self.assertEqual(links, [])


if __name__ == "__main__":
    unittest.main()
