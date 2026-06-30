"""Generate county_id and URL candidate slugs from us_locations entries."""

from __future__ import annotations

import re

SUFFIX_PATTERN = re.compile(
    r"\b(County|Parish|Borough|Census Area|Municipality|City and Borough)\b",
    re.IGNORECASE,
)


def normalize_name(raw: str) -> str:
    """Strip jurisdiction suffix and non-alphanumerics."""
    base = SUFFIX_PATTERN.sub("", raw).strip()
    return re.sub(r"[^a-z0-9]", "", base.lower())


def parse_location_entry(entry: str) -> tuple[str, str, str]:
    """Parse 'Autauga County, AL' -> (display_name, state, county_id)."""
    name_part, state = entry.rsplit(", ", 1)
    state = state.upper()
    slug = normalize_name(name_part)
    county_id = f"{state.lower()}-{slug}"
    return name_part, state, county_id


def candidate_slugs(name_part: str, state: str) -> list[str]:
    """Ordered slug variants for vendor URL pattern probing."""
    base = normalize_name(name_part)
    state_lower = state.lower()
    variants = [
        f"{state_lower}-{base}county",
        f"{state_lower}-{base}-county",
        f"{state_lower}-{base}",
        f"{state_lower}{base}county",
        f"{base}-county",
        base,
        f"{base}county",
        f"{state_lower}{base}",
    ]
    seen: set[str] = set()
    out: list[str] = []
    for slug in variants:
        if slug and slug not in seen:
            seen.add(slug)
            out.append(slug)
    return out


def build_vendor_urls(slug: str) -> list[tuple[str, str]]:
    """Return (platform, url) candidates for a slug, priority order.

    Legistar is probed last — {slug}.legistar.com often returns a generic 200
    shell even when the county is on another platform (or has no portal).
    """
    return [
        ("civicplus", f"https://{slug}.civicplus.com/AgendaCenter"),
        ("legistar", f"https://{slug}.legistar.com"),
        ("novusagenda", f"https://{slug}.novusagenda.com/agendapublic/"),
        ("granicus", f"https://{slug}.granicus.com/ViewPublisher.php"),
        ("iqm2", f"https://{slug}.iqm2.com/Citizens/Default.aspx"),
        ("boarddocs", f"https://go.boarddocs.com/{slug}/Board.nsf/Public"),
        ("escribe", f"https://pub-{slug}.escribemeetings.com/"),
    ]
