"""Tests for county discovery classification heuristics (no network)."""

from __future__ import annotations

import unittest

from scripts.county_discovery.classify import (
    ProbeResult,
    classify_content_sniff,
    classify_no_match,
    classify_probe,
    detect_platform_from_response,
)
from scripts.county_discovery.slugs import candidate_slugs, normalize_name, parse_location_entry


def _portal_html(template: str) -> str:
    """Pad fixture HTML past MIN_PORTAL_BYTES (5000) for vendor portal tests."""
    return template + ("<!-- pad -->" + "x" * 5200)


LEGISTAR_HTML = _portal_html("""
<html><head><title>Legistar</title></head>
<body><a href="/Calendar.aspx">Calendar</a>
<div id="SearchCalendar">Search Calendar</div>
<table id="rgCalendar"><tr><td>Board Meeting</td><td>01/15/2026</td></tr></table>
Board of Supervisors Agenda MeetingDetail LegistarWeb</body></html>
""")

CIVICPLUS_HTML = _portal_html("""
<html><body><div id="AgendaCenter">Agenda Center</div>
<h1>Agenda Center</h1>
<p>View meeting agendas and minutes for the county board of commissioners.</p>
<a href="/AgendaCenter">View Agendas</a></body></html>
""")

NOVUS_HTML = _portal_html("""
<html><body>NovusAGENDA Public Portal agendapublic Meeting Minutes Calendar
<table><tr><td>Board Meeting Agenda</td><td>01/15/2026</td></tr></table>
<a href="Meetings.aspx">View Meetings</a></body></html>
""")

GRANICUS_HTML = _portal_html("""
<html><body>Granicus ViewPublisher Meeting Agendas and Minutes
<p>Official meeting videos and agenda documents for the county government.</p>
</body></html>
""")

PARKED_HTML = """
<html><body>This domain is for sale. Buy this domain.</body></html>
"""

AMBIGUOUS_HTML = """
<html><body>Welcome to our county website. About us. Contact.</body></html>
"""

GOV_AGENDA_HTML = """
<html><body>Board of Commissioners Meeting Agenda and Minutes archive</body></html>
"""


class TestSlugs(unittest.TestCase):
    def test_normalize_name(self):
        self.assertEqual(normalize_name("Sonoma County"), "sonoma")
        self.assertEqual(normalize_name("Acadia Parish"), "acadia")
        self.assertEqual(normalize_name("Aleutians East Borough"), "aleutianseast")

    def test_parse_location_entry(self):
        name, state, county_id = parse_location_entry("Sonoma County, CA")
        self.assertEqual(name, "Sonoma County")
        self.assertEqual(state, "CA")
        self.assertEqual(county_id, "ca-sonoma")

    def test_candidate_slugs_variants(self):
        slugs = candidate_slugs("Pima County", "AZ")
        self.assertIn("pima", slugs)
        self.assertIn("pimacounty", slugs)


class TestDetectPlatform(unittest.TestCase):
    def test_legistar_markers(self):
        self.assertEqual(
            detect_platform_from_response(
                "https://sonoma-county.legistar.com",
                LEGISTAR_HTML,
                "legistar",
            ),
            "legistar",
        )

    def test_civicplus_markers(self):
        self.assertEqual(
            detect_platform_from_response(
                "https://nc-nashcounty.civicplus.com/AgendaCenter",
                CIVICPLUS_HTML,
                "civicplus",
            ),
            "civicplus",
        )

    def test_novusagenda_markers(self):
        self.assertEqual(
            detect_platform_from_response(
                "https://brazos.novusagenda.com/agendapublic/",
                NOVUS_HTML,
                "novusagenda",
            ),
            "novusagenda",
        )

    def test_granicus_markers(self):
        self.assertEqual(
            detect_platform_from_response(
                "https://fairfax.granicus.com/ViewPublisher.php",
                GRANICUS_HTML,
                "granicus",
            ),
            "granicus",
        )

    def test_parked_domain_rejected(self):
        self.assertIsNone(
            detect_platform_from_response(
                "https://deadcounty.legistar.com",
                PARKED_HTML,
                "legistar",
            ),
        )

    def test_generic_legistar_shell_rejected(self):
        self.assertIsNone(
            detect_platform_from_response(
                "https://fake.legistar.com",
                "Invalid parameters!",
                "legistar",
            ),
        )


class TestClassifyProbe(unittest.TestCase):
    def test_legistar_high_confidence(self):
        probe = ProbeResult(
            url="https://pima.legistar.com",
            platform_hint="legistar",
            http_status=200,
            body_snippet=LEGISTAR_HTML,
            final_url="https://pima.legistar.com",
        )
        result = classify_probe(probe, "AZ")
        assert result is not None
        self.assertEqual(result.platform, "legistar")
        self.assertEqual(result.scraper_strategy, "civic_scraper")
        self.assertTrue(result.platform_supported)
        self.assertEqual(result.confidence, "high")
        self.assertEqual(result.timezone, "America/Phoenix")

    def test_novusagenda_crawl4ai(self):
        probe = ProbeResult(
            url="https://brazos.novusagenda.com/agendapublic/",
            platform_hint="novusagenda",
            http_status=200,
            body_snippet=NOVUS_HTML,
        )
        result = classify_probe(probe, "TX")
        assert result is not None
        self.assertEqual(result.platform, "novusagenda")
        self.assertEqual(result.scraper_strategy, "crawl4ai")
        self.assertFalse(result.platform_supported)

    def test_redirect_status_accepted(self):
        probe = ProbeResult(
            url="https://example.civicplus.com/AgendaCenter",
            platform_hint="civicplus",
            http_status=302,
            body_snippet=CIVICPLUS_HTML,
            final_url="https://example.civicplus.com/AgendaCenter",
        )
        result = classify_probe(probe, "NC")
        assert result is not None
        self.assertEqual(result.platform, "civicplus")

    def test_failed_status_rejected(self):
        probe = ProbeResult(
            url="https://missing.legistar.com",
            platform_hint="legistar",
            http_status=404,
            body_snippet="",
        )
        self.assertIsNone(classify_probe(probe, "CA"))


class TestClassifyContentSniff(unittest.TestCase):
    def test_gov_agenda_page(self):
        result = classify_content_sniff(
            "https://www.examplecounty.gov/meetings",
            200,
            GOV_AGENDA_HTML,
            "GA",
        )
        assert result is not None
        self.assertEqual(result.scraper_strategy, "crawl4ai")
        self.assertEqual(result.confidence, "medium")

    def test_ambiguous_page_rejected(self):
        self.assertIsNone(
            classify_content_sniff(
                "https://www.examplecounty.gov/",
                200,
                AMBIGUOUS_HTML,
                "GA",
            ),
        )

    def test_parked_page_rejected(self):
        self.assertIsNone(
            classify_content_sniff(
                "https://www.examplecounty.gov/agenda",
                200,
                PARKED_HTML,
                "GA",
            ),
        )


class TestClassifyNoMatch(unittest.TestCase):
    def test_no_match_flags_review(self):
        result = classify_no_match("al-autauga", "Autauga County", "AL")
        self.assertTrue(result.needs_review)
        self.assertEqual(result.confidence, "low")
        self.assertEqual(result.source_urls, [])


if __name__ == "__main__":
    unittest.main()
