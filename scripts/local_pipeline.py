#!/usr/bin/env python3
"""
Local pipeline: scrape real counties -> download PDFs -> Docling extract -> chunks.json.

Usage (from repo root):
  python3 scripts/local_pipeline.py
  pnpm local:scrape-extract

Requires: .env.local (pnpm qwen:setup), heavy Python deps installed.
Outputs: local-run/raw/, local-run/staging/<county>/<doc_id>/chunks.json
"""

from __future__ import annotations

import asyncio
import hashlib
import importlib.util
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import ModuleType
from uuid import uuid4

import aiohttp

ROOT = Path(__file__).resolve().parent.parent
SCRAPER_ROOT = ROOT / "functions" / "scraper"
ANALYZER_ROOT = ROOT / "functions" / "analyzer"
LOCAL_RUN = ROOT / "local-run"
CONFIG_PATH = ROOT / "config" / "counties.json"

_SCRAPER: ModuleType | None = None
_ANALYZER: ModuleType | None = None


def load_env_local() -> None:
    env_path = ROOT / ".env.local"
    if not env_path.exists():
        print("WARNING: .env.local not found — run: pnpm qwen:setup", file=sys.stderr)
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())

    # Keep crawl4ai/playwright caches inside the repo for local runs
    crawl4ai_home = ROOT / "local-run" / "crawl4ai"
    crawl4ai_home.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("CRAWL4_AI_BASE_DIRECTORY", str(crawl4ai_home))
    playwright_browsers = ROOT / ".playwright-browsers"
    playwright_browsers.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(playwright_browsers))


def _load_package(name: str, package_root: Path) -> ModuleType:
    """Load a function package by temporarily prepending its root to sys.path."""
    inserted = str(package_root)
    if inserted not in sys.path:
        sys.path.insert(0, inserted)
    spec = importlib.util.spec_from_file_location(
        f"beaver_{name}_scrapers" if name == "scraper" else f"beaver_{name}_main",
        package_root / "src" / ("scrapers.py" if name == "scraper" else "main.py"),
        submodule_search_locations=[str(package_root / "src")],
    )
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {name} package from {package_root}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def setup_modules() -> tuple[ModuleType, ModuleType]:
    global _SCRAPER, _ANALYZER
    load_env_local()
    os.environ.setdefault("SCRAPER_REAL", "true")
    os.environ.setdefault("USE_DOCLING", "true")
    os.environ.setdefault("MOCK_MODE", "false")

    if _SCRAPER is None:
        # Load doc_types + errors + scrapers via scraper package
        sys.path.insert(0, str(SCRAPER_ROOT))
        scrapers = importlib.import_module("src.scrapers")
        doc_types = importlib.import_module("src.doc_types")
        errors = importlib.import_module("src.errors")
        _SCRAPER = ModuleType("beaver_scraper_bundle")
        _SCRAPER.scrapers = scrapers  # type: ignore[attr-defined]
        _SCRAPER.doc_types = doc_types  # type: ignore[attr-defined]
        _SCRAPER.errors = errors  # type: ignore[attr-defined]

    if _ANALYZER is None:
        # Load analyzer main without conflicting with scraper's src.main on sys.path
        spec = importlib.util.spec_from_file_location(
            "beaver_analyzer_main",
            ANALYZER_ROOT / "src" / "main.py",
            submodule_search_locations=[str(ANALYZER_ROOT / "src")],
        )
        if spec is None or spec.loader is None:
            raise ImportError("Cannot load analyzer main")
        analyzer_main = importlib.util.module_from_spec(spec)
        # Ensure chunking submodule resolves under analyzer
        chunking_spec = importlib.util.spec_from_file_location(
            "src.chunking",
            ANALYZER_ROOT / "src" / "chunking.py",
        )
        if chunking_spec and chunking_spec.loader:
            chunking_mod = importlib.util.module_from_spec(chunking_spec)
            sys.modules["src.chunking"] = chunking_mod
            chunking_spec.loader.exec_module(chunking_mod)
        spec.loader.exec_module(analyzer_main)
        _ANALYZER = analyzer_main

    return _SCRAPER, _ANALYZER


logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("local_pipeline")


def content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def make_document_id(county_id: str, hash_hex: str) -> str:
    return f"doc-{county_id}-{hash_hex[:16]}"


async def download_url(session: aiohttp.ClientSession, url: str) -> bytes:
    async with session.get(url, timeout=aiohttp.ClientTimeout(total=120)) as resp:
        resp.raise_for_status()
        return await resp.read()


async def process_county(scraper_mod: ModuleType, analyzer_mod: ModuleType, county: dict, max_docs: int) -> dict:
    scrape_for_strategy = scraper_mod.scrapers.scrape_for_strategy
    classify_doc_type = scraper_mod.doc_types.classify_doc_type
    is_target_doc_type = scraper_mod.doc_types.is_target_doc_type
    StructuralScrapeError = scraper_mod.errors.StructuralScrapeError
    extract_text = analyzer_mod.extract_text
    chunk_text = analyzer_mod.chunk_text
    chunk_text = analyzer_mod.chunk_text

    county_id = county["county_id"]
    strategy = county.get("scraper_strategy", "crawl4ai")
    platform = county.get("platform")
    tz_name = county.get("timezone")
    source_urls = county["source_urls"]

    result: dict = {"county_id": county_id, "documents": [], "errors": []}

    try:
        links = await scrape_for_strategy(strategy, source_urls, platform, county_id, tz_name)
    except StructuralScrapeError as e:
        result["errors"].append(str(e))
        logger.error("Structural scrape failure for %s: %s", county_id, e)
        return result
    except Exception as e:
        result["errors"].append(str(e))
        logger.exception("Scrape failed for %s", county_id)
        return result

    logger.info("%s: found %d candidate links", county_id, len(links))
    seen_hashes: set[str] = set()
    downloaded = 0

    async with aiohttp.ClientSession() as session:
        for item in links:
            if downloaded >= max_docs:
                break

            url = item["url"]
            doc_type = classify_doc_type(url, item.get("title", ""))
            if not is_target_doc_type(doc_type):
                continue

            try:
                data = await download_url(session, url)
            except Exception as e:
                logger.warning("Download failed %s: %s", url, e)
                continue

            hash_hex = content_hash(data)
            if hash_hex in seen_hashes:
                continue
            seen_hashes.add(hash_hex)

            doc_id = make_document_id(county_id, hash_hex)
            raw_dir = LOCAL_RUN / "raw" / county_id / doc_id
            raw_dir.mkdir(parents=True, exist_ok=True)
            (raw_dir / f"{doc_id}.pdf").write_bytes(data)

            text, used_docling = extract_text(data, doc_id)
            chunks = chunk_text(text, doc_id, used_docling)

            staging_dir = LOCAL_RUN / "staging" / county_id / doc_id
            staging_dir.mkdir(parents=True, exist_ok=True)
            output = {
                "document_id": doc_id,
                "county_id": county_id,
                "trace_id": str(uuid4()),
                "extracted_at": datetime.now(timezone.utc).isoformat(),
                "chunk_count": len(chunks),
                "chunks": chunks,
                "content_hash": hash_hex,
                "extraction_method": "docling" if used_docling else "mock",
                "source_url": url,
                "doc_type": doc_type,
            }
            chunks_path = staging_dir / "chunks.json"
            chunks_path.write_text(json.dumps(output, indent=2))

            downloaded += 1
            result["documents"].append({
                "document_id": doc_id,
                "source_url": url,
                "chunks_path": str(chunks_path.relative_to(ROOT)),
                "chunk_count": len(chunks),
                "extraction_method": output["extraction_method"],
            })
            logger.info(
                "%s: saved %s (%d chunks, %s)",
                county_id,
                doc_id,
                len(chunks),
                output["extraction_method"],
            )

    return result


async def run_demo_document(scraper_mod: ModuleType, analyzer_mod: ModuleType) -> dict:
    """Create a local PDF with infrastructure project text when live scraping is unavailable."""
    extract_text = analyzer_mod.extract_text
    chunk_text = analyzer_mod.chunk_text

    county_id = "demo-county"
    demo_text = (
        "# Board of Supervisors Agenda\n\n"
        "Capital Improvement Project CIP-2024-042 — Roadway Resurfacing and Drainage Improvements.\n\n"
        "Estimated budget $2.5M for Phase 1 civil infrastructure along County Route 12. "
        "Subcommittee review of scope including stormwater drainage pipe replacement and "
        "asphalt resurfacing. Project tracking number CIP-2024-042.\n"
    )

    # Minimal PDF with embedded text (reportlab not required — use raw PDF bytes)
    pdf_bytes = _minimal_pdf_with_text(demo_text)
    hash_hex = content_hash(pdf_bytes)
    doc_id = make_document_id(county_id, hash_hex)

    raw_dir = LOCAL_RUN / "raw" / county_id / doc_id
    raw_dir.mkdir(parents=True, exist_ok=True)
    (raw_dir / f"{doc_id}.pdf").write_bytes(pdf_bytes)

    text, used_docling = extract_text(pdf_bytes, doc_id)
    chunks = chunk_text(text, doc_id, used_docling)

    staging_dir = LOCAL_RUN / "staging" / county_id / doc_id
    staging_dir.mkdir(parents=True, exist_ok=True)
    output = {
        "document_id": doc_id,
        "county_id": county_id,
        "trace_id": str(uuid4()),
        "extracted_at": datetime.now(timezone.utc).isoformat(),
        "chunk_count": len(chunks),
        "chunks": chunks,
        "content_hash": hash_hex,
        "extraction_method": "docling" if used_docling else "mock",
        "source_url": "local://demo",
        "doc_type": "agenda",
    }
    chunks_path = staging_dir / "chunks.json"
    chunks_path.write_text(json.dumps(output, indent=2))

    return {
        "county_id": county_id,
        "documents": [{
            "document_id": doc_id,
            "source_url": "local://demo",
            "chunks_path": str(chunks_path.relative_to(ROOT)),
            "chunk_count": len(chunks),
            "extraction_method": output["extraction_method"],
        }],
        "errors": [],
        "demo": True,
    }


def _minimal_pdf_with_text(text: str) -> bytes:
    """Build a valid PDF using PyMuPDF (already a scraper dependency)."""
    import fitz  # PyMuPDF

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 50), text[:2000], fontsize=11)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


async def main() -> int:
    demo_mode = "--demo" in sys.argv
    scraper_mod, analyzer_mod = setup_modules()

    LOCAL_RUN.mkdir(parents=True, exist_ok=True)
    summary: list[dict] = []

    if demo_mode:
        logger.info("=== Demo mode (local PDF, no network) ===")
        summary.append(await run_demo_document(scraper_mod, analyzer_mod))
    else:
        if not CONFIG_PATH.exists():
            logger.error("Missing %s", CONFIG_PATH)
            return 1

        config = json.loads(CONFIG_PATH.read_text())
        counties = [c for c in config.get("counties", []) if c.get("county_id") != "test-county"]
        max_docs = int(os.getenv("LOCAL_MAX_DOCS_PER_COUNTY", "3"))

        for county in counties:
            logger.info("=== Processing %s (%s) ===", county["county_id"], county.get("name"))
            county_result = await process_county(scraper_mod, analyzer_mod, county, max_docs)
            summary.append(county_result)

    summary_path = LOCAL_RUN / "scrape-summary.json"
    summary_path.write_text(json.dumps(summary, indent=2))
    logger.info("Wrote %s", summary_path)

    total_docs = sum(len(c["documents"]) for c in summary)
    if total_docs == 0:
        logger.error("No documents downloaded — try: pnpm local:demo")
        return 1

    mode = "demo" if demo_mode else "live scrape"
    print(f"\nLocal scrape+extract complete ({mode}): {total_docs} document(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
