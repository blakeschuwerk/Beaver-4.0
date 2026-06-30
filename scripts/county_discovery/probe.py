"""Throttled HTTP probing for county platform discovery."""

from __future__ import annotations

import asyncio
import logging
import random
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import aiohttp

from .classify import (
    CountyDiscoveryResult,
    ProbeResult,
    classify_content_sniff,
    classify_no_match,
    classify_probe,
    finalize_result,
)
from .slugs import build_vendor_urls, candidate_slugs, parse_location_entry
from .timezones import timezone_for_state

logger = logging.getLogger(__name__)

USER_AGENT = "BeaverDiscoveryBot/0.1 (+https://github.com/beaver-4.0; county-agenda-discovery)"
REQUEST_TIMEOUT_SEC = 8
DEFAULT_CONCURRENCY = 8
HOST_DELAY_MIN = 0.5
HOST_DELAY_MAX = 1.0
MAX_BODY_BYTES = 32_768


@dataclass
class ProbeStats:
    requests: int = 0
    started_at: float = field(default_factory=time.monotonic)

    def elapsed_sec(self) -> float:
        return time.monotonic() - self.started_at

    def requests_per_sec(self) -> float:
        elapsed = self.elapsed_sec()
        return self.requests / elapsed if elapsed > 0 else 0.0


class PoliteProber:
    def __init__(
        self,
        session: aiohttp.ClientSession,
        semaphore: asyncio.Semaphore,
        stats: ProbeStats,
    ) -> None:
        self._session = session
        self._semaphore = semaphore
        self._stats = stats
        self._host_last_request: dict[str, float] = {}
        self._robots_cache: dict[str, RobotFileParser | None] = {}

    async def _host_delay(self, host: str) -> None:
        now = time.monotonic()
        last = self._host_last_request.get(host, 0.0)
        wait = HOST_DELAY_MIN + random.random() * (HOST_DELAY_MAX - HOST_DELAY_MIN)
        sleep_for = wait - (now - last)
        if sleep_for > 0:
            await asyncio.sleep(sleep_for)
        self._host_last_request[host] = time.monotonic()

    async def _can_fetch(self, url: str) -> bool:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin not in self._robots_cache:
            rp = RobotFileParser()
            robots_url = f"{origin}/robots.txt"
            try:
                async with self._semaphore:
                    await self._host_delay(parsed.netloc)
                    async with self._session.get(
                        robots_url,
                        timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT_SEC),
                        allow_redirects=True,
                    ) as resp:
                        if resp.status == 200:
                            text = await resp.text()
                            rp.parse(text.splitlines())
                        else:
                            rp = None
            except Exception:
                rp = None
            self._robots_cache[origin] = rp
        rp = self._robots_cache[origin]
        if rp is None:
            return True
        return rp.can_fetch(USER_AGENT, url)

    async def fetch(
        self,
        url: str,
        *,
        check_robots: bool = True,
    ) -> tuple[int, str, str]:
        """Return (status, body_snippet, final_url)."""
        parsed = urlparse(url)
        if check_robots and not await self._can_fetch(url):
            logger.debug("robots.txt disallows %s", url)
            return 0, "", url

        async with self._semaphore:
            await self._host_delay(parsed.netloc)
            self._stats.requests += 1
            try:
                async with self._session.get(
                    url,
                    timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT_SEC),
                    allow_redirects=True,
                    headers={"User-Agent": USER_AGENT},
                ) as resp:
                    body_bytes = await resp.content.read(MAX_BODY_BYTES)
                    body = body_bytes.decode("utf-8", errors="ignore")
                    return resp.status, body, str(resp.url)
            except asyncio.TimeoutError:
                return 0, "", url
            except aiohttp.ClientError as e:
                logger.debug("fetch failed %s: %s", url, e)
                return 0, "", url


async def probe_county(
    prober: PoliteProber,
    entry: str,
    discovered_at: str,
) -> CountyDiscoveryResult:
    name, state, county_id = parse_location_entry(entry)

    for slug in candidate_slugs(name, state):
        for platform_hint, url in build_vendor_urls(slug):
            status, body, final_url = await prober.fetch(url, check_robots=False)
            probe = ProbeResult(
                url=url,
                platform_hint=platform_hint,
                http_status=status,
                body_snippet=body,
                final_url=final_url,
            )
            classified = classify_probe(probe, state)
            if classified:
                return finalize_result(classified, county_id, name, discovered_at)

    # Content-sniff fallback: try {slug}.gov variants (no search API by default)
    for slug in candidate_slugs(name, state)[:3]:
        for gov_url in (
            f"https://www.{slug}.gov/meetings",
            f"https://www.{slug}county.gov/agendas",
            f"https://{slug}county.org/agenda",
        ):
            status, body, final_url = await prober.fetch(gov_url, check_robots=True)
            classified = classify_content_sniff(final_url or gov_url, status, body, state)
            if classified:
                return finalize_result(classified, county_id, name, discovered_at)

    return finalize_result(
        classify_no_match(county_id, name, state),
        county_id,
        name,
        discovered_at,
    )


async def discover_counties(
    entries: list[str],
    *,
    concurrency: int = DEFAULT_CONCURRENCY,
    on_result: Any | None = None,
    skip_ids: set[str] | None = None,
) -> tuple[list[CountyDiscoveryResult], ProbeStats]:
    """Discover platforms for a list of us_locations entries."""
    from datetime import datetime, timezone

    skip_ids = skip_ids or set()
    stats = ProbeStats()
    semaphore = asyncio.Semaphore(concurrency)
    results: list[CountyDiscoveryResult] = []
    discovered_at = datetime.now(timezone.utc).isoformat()

    pending = [e for e in entries if parse_location_entry(e)[2] not in skip_ids]

    async with aiohttp.ClientSession() as session:
        prober = PoliteProber(session, semaphore, stats)

        async def _one(entry: str) -> CountyDiscoveryResult:
            result = await probe_county(prober, entry, discovered_at)
            if on_result:
                on_result(result)
            return result

        tasks = [_one(entry) for entry in pending]
        if tasks:
            results = await asyncio.gather(*tasks)

    return results, stats
