"""Pure classification heuristics — no network I/O."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Any, Literal
from urllib.parse import urlparse

from .timezones import timezone_for_state

Confidence = Literal["high", "medium", "low"]
DetectionMethod = Literal["url_pattern_probe", "content_sniff", "search_api", "none"]
ScraperStrategy = Literal["civic_scraper", "crawl4ai"]

SUPPORTED_PLATFORMS = frozenset({"legistar", "civicplus"})

AGENDA_KEYWORD = re.compile(
    r"agenda|minutes|meeting|board of (supervisors|commissioners)",
    re.IGNORECASE,
)

GENERIC_SHELL = re.compile(
    r"^Invalid parameters!$|domain (is )?for sale|buy this domain|parked (free|page)",
    re.IGNORECASE | re.MULTILINE,
)

# Empirical minimum from real vs wildcard vendor subdomains (see validation probes):
# fake legistar ~19 B, fake novus ~1.4 KB, real portals ~150 KB+.
MIN_PORTAL_BYTES = 5000

PLATFORM_MARKERS: dict[str, re.Pattern[str]] = {
    "legistar": re.compile(
        r"SearchCalendar|MeetingDetail|Calendar\.aspx|LegistarWeb|"
        r"rgCalendar|hypBody|lblBody",
        re.IGNORECASE,
    ),
    "civicplus": re.compile(r"civicplus|AgendaCenter|agendacenter", re.IGNORECASE),
    "novusagenda": re.compile(r"novusagenda|agendapublic|NovusAGENDA", re.IGNORECASE),
    "granicus": re.compile(r"granicus|ViewPublisher|Granicus", re.IGNORECASE),
    "iqm2": re.compile(r"iqm2|Citizens/Default", re.IGNORECASE),
    "boarddocs": re.compile(r"boarddocs|Board\.nsf", re.IGNORECASE),
    "escribe": re.compile(r"escribemeetings|eScribe", re.IGNORECASE),
}

PARKED_PAGE = re.compile(
    r"domain (is )?for sale|buy this domain|parked (free|page)|coming soon|under construction",
    re.IGNORECASE,
)


@dataclass
class ProbeResult:
    url: str
    platform_hint: str
    http_status: int
    body_snippet: str = ""
    final_url: str = ""


@dataclass
class CountyDiscoveryResult:
    county_id: str
    name: str
    state: str
    source_urls: list[str] = field(default_factory=list)
    scraper_strategy: ScraperStrategy | None = None
    platform: str = "unknown"
    platform_supported: bool = False
    timezone: str | None = None
    confidence: Confidence = "low"
    needs_review: bool = True
    detection_method: DetectionMethod = "none"
    detection: dict[str, Any] = field(default_factory=dict)
    notes: str | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "county_id": self.county_id,
            "name": self.name,
            "state": self.state,
            "source_urls": self.source_urls,
            "platform": self.platform,
            "platform_supported": self.platform_supported,
            "confidence": self.confidence,
            "needs_review": self.needs_review,
            "detection_method": self.detection_method,
            "detection": self.detection,
        }
        if self.scraper_strategy:
            out["scraper_strategy"] = self.scraper_strategy
        if self.timezone:
            out["timezone"] = self.timezone
        if self.notes:
            out["notes"] = self.notes
        return out


def content_signature(body: str) -> str:
    normalized = re.sub(r"\s+", " ", body[:4000]).strip().lower()
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]


def is_success_status(status: int) -> bool:
    return 200 <= status < 400


def is_active_portal(platform: str, url: str, body: str) -> bool:
    """Reject wildcard vendor subdomain shells (200 OK but not a real portal)."""
    stripped = body.strip()
    if not stripped or GENERIC_SHELL.search(stripped[:500]):
        return False
    if platform in {"legistar", "novusagenda", "civicplus"}:
        if len(body) < MIN_PORTAL_BYTES:
            return False
    elif len(body) < 400:
        return False
    pattern = PLATFORM_MARKERS.get(platform)
    return bool(pattern and pattern.search(f"{url} {body[:8000]}"))


def detect_platform_from_response(url: str, body: str, platform_hint: str) -> str | None:
    """Return platform id if response matches expected vendor markers."""
    host = urlparse(url).netloc.lower()
    combined = f"{url} {body[:8000]}"

    if PARKED_PAGE.search(body[:5000]):
        return None

    # URL host is strongest signal
    host_map = {
        "legistar.com": "legistar",
        "civicplus.com": "civicplus",
        "novusagenda.com": "novusagenda",
        "granicus.com": "granicus",
        "iqm2.com": "iqm2",
        "boarddocs.com": "boarddocs",
        "escribemeetings.com": "escribe",
    }
    for domain, platform in host_map.items():
        if domain in host:
            if not is_active_portal(platform, url, body):
                return None
            pattern = PLATFORM_MARKERS.get(platform)
            if pattern and pattern.search(combined):
                return platform
            if platform == platform_hint:
                return platform

    if not is_active_portal(platform_hint, url, body):
        return None

    pattern = PLATFORM_MARKERS.get(platform_hint)
    if pattern and pattern.search(combined):
        return platform_hint

    return None


def classify_probe(probe: ProbeResult, state: str) -> CountyDiscoveryResult | None:
    """Classify a single successful vendor probe."""
    if not is_success_status(probe.http_status):
        return None

    platform = detect_platform_from_response(
        probe.final_url or probe.url,
        probe.body_snippet,
        probe.platform_hint,
    )
    if not platform:
        return None

    tz, tz_needs_review = timezone_for_state(state)
    supported = platform in SUPPORTED_PLATFORMS
    strategy: ScraperStrategy = "civic_scraper" if supported else "crawl4ai"
    confidence: Confidence = "high" if supported else ("high" if platform != "unknown" else "medium")

    needs_review = tz_needs_review and platform == "legistar"
    if platform == "legistar" and not tz:
        needs_review = True

    matched_url = probe.final_url or probe.url
    result = CountyDiscoveryResult(
        county_id="",
        name="",
        state=state,
        source_urls=[matched_url],
        scraper_strategy=strategy,
        platform=platform,
        platform_supported=supported,
        timezone=tz if platform == "legistar" else None,
        confidence=confidence,
        needs_review=needs_review,
        detection_method="url_pattern_probe",
        detection={
            "matched_url": matched_url,
            "http_status": probe.http_status,
            "content_signature": content_signature(probe.body_snippet),
        },
    )
    return result


def classify_content_sniff(
    url: str,
    http_status: int,
    body: str,
    state: str,
) -> CountyDiscoveryResult | None:
    """Fallback: generic .gov page with agenda keywords."""
    if http_status != 200:
        return None
    if PARKED_PAGE.search(body[:5000]):
        return None
    if not AGENDA_KEYWORD.search(body[:12000]):
        return None

    # Check if body mentions a known vendor even on custom domain
    for platform, pattern in PLATFORM_MARKERS.items():
        if pattern.search(body[:12000]):
            supported = platform in SUPPORTED_PLATFORMS
            tz, tz_needs_review = timezone_for_state(state)
            return CountyDiscoveryResult(
                county_id="",
                name="",
                state=state,
                source_urls=[url],
                scraper_strategy="civic_scraper" if supported else "crawl4ai",
                platform=platform,
                platform_supported=supported,
                timezone=tz if platform == "legistar" else None,
                confidence="medium",
                needs_review=tz_needs_review and platform == "legistar",
                detection_method="content_sniff",
                detection={
                    "matched_url": url,
                    "http_status": http_status,
                    "content_signature": content_signature(body),
                },
            )

    return CountyDiscoveryResult(
        county_id="",
        name="",
        state=state,
        source_urls=[url],
        scraper_strategy="crawl4ai",
        platform="unknown",
        platform_supported=False,
        confidence="medium",
        needs_review=False,
        detection_method="content_sniff",
        detection={
            "matched_url": url,
            "http_status": http_status,
            "content_signature": content_signature(body),
        },
    )


def classify_no_match(county_id: str, name: str, state: str) -> CountyDiscoveryResult:
    return CountyDiscoveryResult(
        county_id=county_id,
        name=name,
        state=state,
        source_urls=[],
        platform="unknown",
        platform_supported=False,
        confidence="low",
        needs_review=True,
        detection_method="none",
        detection={},
        notes="No usable agenda URL found",
    )


def finalize_result(
    result: CountyDiscoveryResult,
    county_id: str,
    name: str,
    discovered_at: str,
) -> CountyDiscoveryResult:
    result.county_id = county_id
    result.name = name
    result.detection["discovered_at"] = discovered_at
    return result
