"""Scraping strategies — real libraries when SCRAPER_REAL=true, heuristic fallback otherwise."""

import logging
import os
import re
from typing import Any
from urllib.parse import urljoin, urlparse

import aiohttp

from .errors import StructuralScrapeError, raise_if_structural_http

logger = logging.getLogger(__name__)

SCRAPER_REAL = os.getenv("SCRAPER_REAL", "false").lower() == "true"
PDF_LINK_PATTERN = re.compile(r'href=["\']([^"\']+\.pdf[^"\']*)["\']', re.I)


def _normalize_link(base_url: str, link: str) -> str:
    if link.startswith("http"):
        return link
    return urljoin(base_url, link)


def _dedupe_documents(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for item in items:
        url = item.get("url", "")
        if not url or url in seen:
            continue
        seen.add(url)
        out.append(item)
    return out


async def scrape_heuristic_fallback(
    source_urls: list[str],
    county_id: str | None = None,
) -> list[dict[str, Any]]:
    """aiohttp PDF link extraction — safe default when real libs unavailable."""
    documents: list[dict[str, Any]] = []
    structural_failures = 0

    async with aiohttp.ClientSession() as session:
        for url in source_urls:
            try:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                    raise_if_structural_http(resp.status, url, county_id)
                    resp.raise_for_status()
                    html = await resp.read()
                text = html.decode("utf-8", errors="ignore")
                pdf_links = PDF_LINK_PATTERN.findall(text)
                if not pdf_links:
                    logger.warning("No PDF links found at %s", url)
                for link in pdf_links[:20]:
                    full_url = _normalize_link(url, link)
                    documents.append({"url": full_url, "title": link})
            except StructuralScrapeError:
                structural_failures += 1
                raise
            except aiohttp.ClientResponseError as e:
                if e.status in {404, 410, 451}:
                    structural_failures += 1
                    raise StructuralScrapeError(
                        f"Structural HTTP {e.status} for {url}",
                        county_id=county_id,
                        url=url,
                    ) from e
                logger.warning("Failed to crawl %s: %s", url, e)
            except Exception as e:
                logger.warning("Failed to crawl %s: %s", url, e)

    if not documents and source_urls and structural_failures == len(source_urls):
        raise StructuralScrapeError(
            f"All source URLs failed structurally for county {county_id}",
            county_id=county_id,
        )

    return _dedupe_documents(documents)


async def scrape_civic_scraper_real(
    source_urls: list[str],
    platform: str | None = None,
    county_id: str | None = None,
) -> list[dict[str, Any]]:
    """Use civic-scraper when installed and SCRAPER_REAL=true."""
    try:
        from civic_scraper import CivicScraper  # type: ignore
    except ImportError as e:
        logger.warning("civic-scraper not installed — falling back to heuristics")
        return await scrape_heuristic_fallback(source_urls, county_id)

    documents: list[dict[str, Any]] = []
    for url in source_urls:
        try:
            scraper = CivicScraper(url, platform=platform) if platform else CivicScraper(url)
            assets = scraper.scrape()
            for asset in assets:
                asset_url = getattr(asset, "url", None) or getattr(asset, "href", None)
                if not asset_url:
                    continue
                title = getattr(asset, "title", None) or getattr(asset, "name", "") or asset_url
                documents.append({"url": str(asset_url), "title": str(title)})
        except Exception as e:
            msg = str(e).lower()
            if "404" in msg or "not found" in msg:
                raise StructuralScrapeError(str(e), county_id=county_id, url=url) from e
            logger.warning("civic-scraper failed for %s: %s", url, e)

    if not documents:
        logger.warning("civic-scraper returned no documents — trying heuristic fallback")
        return await scrape_heuristic_fallback(source_urls, county_id)

    return _dedupe_documents(documents)


async def scrape_crawl4ai_real(
    source_urls: list[str],
    county_id: str | None = None,
) -> list[dict[str, Any]]:
    """Use crawl4ai when installed and SCRAPER_REAL=true."""
    try:
        from crawl4ai import AsyncWebCrawler  # type: ignore
    except ImportError:
        logger.warning("crawl4ai not installed — falling back to heuristics")
        return await scrape_heuristic_fallback(source_urls, county_id)

    documents: list[dict[str, Any]] = []
    async with AsyncWebCrawler() as crawler:
        for url in source_urls:
            try:
                result = await crawler.arun(url=url)
                if getattr(result, "status_code", 200) in {404, 410, 451}:
                    raise StructuralScrapeError(
                        f"Structural HTTP {result.status_code} for {url}",
                        county_id=county_id,
                        url=url,
                    )

                links: list[str] = []
                if hasattr(result, "links") and result.links:
                    internal = result.links.get("internal", []) if isinstance(result.links, dict) else result.links
                    for link in internal or []:
                        href = link.get("href") if isinstance(link, dict) else str(link)
                        if href and (".pdf" in href.lower() or "pdf" in href.lower()):
                            links.append(_normalize_link(url, href))

                markdown = getattr(result, "markdown", "") or ""
                links.extend(PDF_LINK_PATTERN.findall(markdown))

                for link in links[:30]:
                    full_url = _normalize_link(url, link)
                    if urlparse(full_url).path.lower().endswith(".pdf") or ".pdf" in full_url.lower():
                        documents.append({"url": full_url, "title": link})
            except StructuralScrapeError:
                raise
            except Exception as e:
                msg = str(e).lower()
                if "404" in msg or "not found" in msg:
                    raise StructuralScrapeError(str(e), county_id=county_id, url=url) from e
                logger.warning("crawl4ai failed for %s: %s", url, e)

    if not documents:
        logger.warning("crawl4ai returned no documents — trying heuristic fallback")
        return await scrape_heuristic_fallback(source_urls, county_id)

    return _dedupe_documents(documents)


async def scrape_for_strategy(
    strategy: str,
    source_urls: list[str],
    platform: str | None = None,
    county_id: str | None = None,
) -> list[dict[str, Any]]:
    """Route to real or fallback scraper based on SCRAPER_REAL flag."""
    if not source_urls:
        raise StructuralScrapeError("No source_urls provided", county_id=county_id)

    if SCRAPER_REAL:
        if strategy == "civic_scraper":
            return await scrape_civic_scraper_real(source_urls, platform, county_id)
        return await scrape_crawl4ai_real(source_urls, county_id)

    return await scrape_heuristic_fallback(source_urls, county_id)
