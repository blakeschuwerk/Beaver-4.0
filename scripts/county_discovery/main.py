#!/usr/bin/env python3
"""Bulk county platform discovery — resumable, politely throttled.

Usage (from repo root):
  python3 -m scripts.county_discovery.main --sample 30
  python3 -m scripts.county_discovery.main --validate
  python3 -m scripts.county_discovery.main --full
  pnpm discover:counties
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

import aiohttp

ROOT = Path(__file__).resolve().parents[2]
US_LOCATIONS = ROOT / "packages" / "shared" / "data" / "us_locations.json"
OUTPUT_DIR = ROOT / "local-run" / "county-discovery"
CHECKPOINT = OUTPUT_DIR / "results.ndjson"
DISCOVERED = ROOT / "local-run" / "discovered-counties.json"
SUMMARY = OUTPUT_DIR / "summary.json"
GROUND_TRUTH = Path(__file__).parent / "ground_truth.json"
VERIFY_CHECKPOINT = OUTPUT_DIR / "verify-results.ndjson"
VERIFIED = ROOT / "local-run" / "verified-counties.json"
VERIFY_SUMMARY = OUTPUT_DIR / "verify-summary.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)


def load_us_locations() -> list[str]:
    data = json.loads(US_LOCATIONS.read_text())
    entries: list[str] = []
    for _state, counties in data.items():
        entries.extend(counties)
    return entries


def load_checkpoint() -> dict[str, dict]:
    if not CHECKPOINT.exists():
        return {}
    results: dict[str, dict] = {}
    for line in CHECKPOINT.read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        results[row["county_id"]] = row
    return results


def append_checkpoint(result: dict) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with CHECKPOINT.open("a") as f:
        f.write(json.dumps(result) + "\n")


def sample_entries(all_entries: list[str], n: int) -> list[str]:
    if n >= len(all_entries):
        return all_entries
    step = max(1, len(all_entries) // n)
    return [all_entries[i] for i in range(0, len(all_entries), step)][:n]


def summarize(results: list[dict]) -> dict:
    by_platform: dict[str, int] = {}
    needs_review = 0
    no_url = 0
    for r in results:
        plat = r.get("platform", "unknown")
        by_platform[plat] = by_platform.get(plat, 0) + 1
        if r.get("needs_review"):
            needs_review += 1
        if not r.get("source_urls"):
            no_url += 1
    return {
        "total": len(results),
        "by_platform": dict(sorted(by_platform.items(), key=lambda x: -x[1])),
        "needs_review": needs_review,
        "no_usable_url": no_url,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def write_outputs(all_results: dict[str, dict], stats: dict | None = None) -> None:
    counties = sorted(all_results.values(), key=lambda r: r["county_id"])
    DISCOVERED.parent.mkdir(parents=True, exist_ok=True)
    DISCOVERED.write_text(
        json.dumps({"counties": counties}, indent=2) + "\n",
    )
    summary = summarize(list(all_results.values()))
    if stats:
        summary["probe_stats"] = stats
    SUMMARY.write_text(json.dumps(summary, indent=2) + "\n")
    logger.info("Wrote %s (%d counties)", DISCOVERED, len(counties))
    logger.info("Summary: %s", json.dumps(summary, indent=2))


async def run_discovery(entries: list[str], concurrency: int) -> None:
    from .probe import discover_counties

    existing = load_checkpoint()
    skip_ids = set(existing.keys())
    logger.info(
        "Processing %d counties (%d already checkpointed, skipping)",
        len(entries),
        len(skip_ids),
    )

    all_results = dict(existing)

    def on_result(result) -> None:
        row = result.to_dict()
        append_checkpoint(row)
        all_results[row["county_id"]] = row
        logger.info(
            "%s -> %s (%s) needs_review=%s",
            row["county_id"],
            row.get("platform"),
            row.get("scraper_strategy"),
            row.get("needs_review"),
        )

    # Process in batches to avoid spawning thousands of tasks at once
    batch_size = 50
    total_stats = {"requests": 0, "elapsed_sec": 0.0}

    for i in range(0, len(entries), batch_size):
        batch = entries[i : i + batch_size]
        batch_skip = {e for e in batch if True}  # filter inside discover_counties
        _results, stats = await discover_counties(
            batch,
            concurrency=concurrency,
            on_result=on_result,
            skip_ids=skip_ids,
        )
        total_stats["requests"] += stats.requests
        total_stats["elapsed_sec"] += stats.elapsed_sec()
        # Refresh skip set for next batch
        skip_ids = set(all_results.keys())

    rps = total_stats["requests"] / total_stats["elapsed_sec"] if total_stats["elapsed_sec"] else 0
    probe_stats = {
        "requests": total_stats["requests"],
        "elapsed_sec": round(total_stats["elapsed_sec"], 1),
        "requests_per_sec": round(rps, 2),
        "concurrency": concurrency,
    }
    write_outputs(all_results, probe_stats)


def load_verify_checkpoint() -> dict[str, dict]:
    if not VERIFY_CHECKPOINT.exists():
        return {}
    results: dict[str, dict] = {}
    for line in VERIFY_CHECKPOINT.read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        results[row["county_id"]] = row
    return results


def append_verify_checkpoint(result: dict) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with VERIFY_CHECKPOINT.open("a") as f:
        f.write(json.dumps(result) + "\n")


def summarize_verification(results: list[dict]) -> dict:
    total = len(results)
    verified_ok = sum(1 for r in results if r.get("verified_ok"))
    not_real_portal = sum(1 for r in results if not r.get("is_real_portal"))
    wrong_jurisdiction = sum(
        1 for r in results if r.get("is_real_portal") and not r.get("jurisdiction_matches")
    )
    platform_mismatch = sum(
        1
        for r in results
        if r.get("is_real_portal") and r.get("jurisdiction_matches") and not r.get("platform_agrees")
    )
    errors = sum(1 for r in results if r.get("error"))
    return {
        "total": total,
        "verified_ok": verified_ok,
        "verified_ok_pct": round(verified_ok / total * 100, 1) if total else 0.0,
        "not_real_portal": not_real_portal,
        "wrong_jurisdiction": wrong_jurisdiction,
        "platform_mismatch": platform_mismatch,
        "errors": errors,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


async def run_verify(only_found: bool, llm_concurrency: int, http_concurrency: int) -> None:
    from .probe import PoliteProber, ProbeStats
    from .verify import verify_one

    if not DISCOVERED.exists():
        logger.error("%s not found — run discovery first (--full or --sample)", DISCOVERED)
        return

    discovered = json.loads(DISCOVERED.read_text())["counties"]
    targets = [c for c in discovered if c.get("source_urls")] if only_found else discovered

    existing = load_verify_checkpoint()
    skip_ids = set(existing.keys())
    pending = [c for c in targets if c["county_id"] not in skip_ids]
    logger.info(
        "Verifying %d counties (%d already checkpointed, %d total candidates)",
        len(pending), len(skip_ids), len(targets),
    )

    llm_semaphore = asyncio.Semaphore(llm_concurrency)
    http_semaphore = asyncio.Semaphore(http_concurrency)
    stats = ProbeStats()
    all_results = dict(existing)

    async with aiohttp.ClientSession() as session:
        prober = PoliteProber(session, http_semaphore, stats)

        async def _one(county: dict) -> None:
            result = await verify_one(session, llm_semaphore, prober, county)
            row = result.to_dict()
            append_verify_checkpoint(row)
            all_results[row["county_id"]] = row
            logger.info(
                "%s verified_ok=%s claimed=%s detected=%s :: %s",
                row["county_id"], row["verified_ok"], row["claimed_platform"],
                row["detected_platform"], row["reasoning"][:100],
            )

        batch_size = 25
        for i in range(0, len(pending), batch_size):
            batch = pending[i : i + batch_size]
            await asyncio.gather(*[_one(c) for c in batch])

    VERIFIED.parent.mkdir(parents=True, exist_ok=True)
    VERIFIED.write_text(
        json.dumps({"counties": sorted(all_results.values(), key=lambda r: r["county_id"])}, indent=2) + "\n",
    )
    summary = summarize_verification(list(all_results.values()))
    VERIFY_SUMMARY.write_text(json.dumps(summary, indent=2) + "\n")
    logger.info("Wrote %s", VERIFIED)
    logger.info("Verification summary: %s", json.dumps(summary, indent=2))


def run_validate() -> int:
    """Compare probe results against hand-labeled ground truth."""
    from .probe import discover_counties

    gt = json.loads(GROUND_TRUTH.read_text())
    samples = gt["samples"]
    entries = [s["entry"] for s in samples]

    async def _run():
        results, _stats = await discover_counties(entries, concurrency=4)
        return results

    results = asyncio.run(_run())
    by_id = {r.county_id: r for r in results}

    correct = 0
    total = len(samples)
    details: list[dict] = []

    for sample in samples:
        from .slugs import parse_location_entry

        _, _, expected_id = parse_location_entry(sample["entry"])
        result = by_id.get(expected_id)
        if result is None:
            details.append({"entry": sample["entry"], "match": False, "reason": "no result"})
            continue

        exp_platform = sample.get("expected_platform")
        exp_url = sample.get("expected_url_contains")
        exp_strategy = sample.get("expected_strategy")
        exp_none = sample.get("expected_none", False)

        platform_ok = (result.platform == exp_platform) if exp_platform else True
        url_ok = True
        if exp_url and result.source_urls:
            url_ok = any(exp_url in u for u in result.source_urls)
        elif exp_url and not result.source_urls:
            url_ok = False
        strategy_ok = (result.scraper_strategy == exp_strategy) if exp_strategy else True
        none_ok = (not result.source_urls) if exp_none else True

        match = platform_ok and url_ok and strategy_ok and none_ok
        if match:
            correct += 1
        details.append({
            "entry": sample["entry"],
            "match": match,
            "expected_platform": exp_platform,
            "got_platform": result.platform,
            "got_urls": result.source_urls,
            "expected_strategy": exp_strategy,
            "got_strategy": result.scraper_strategy,
        })

    accuracy = correct / total if total else 0.0
    report = {
        "accuracy": round(accuracy, 3),
        "correct": correct,
        "total": total,
        "details": details,
        "validated_at": datetime.now(timezone.utc).isoformat(),
    }
    report_path = OUTPUT_DIR / "validation-report.json"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    logger.info("Validation accuracy: %.1f%% (%d/%d)", accuracy * 100, correct, total)
    logger.info("Report: %s", report_path)
    print(json.dumps({"accuracy": report["accuracy"], "correct": correct, "total": total}))
    return 0 if accuracy >= 0.5 else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Beaver county platform discovery")
    parser.add_argument("--sample", type=int, metavar="N", help="Probe N evenly-spaced counties (hit-rate sample)")
    parser.add_argument("--full", action="store_true", help="Run against all us_locations entries")
    parser.add_argument("--validate", action="store_true", help="Run ground-truth validation sample")
    parser.add_argument("--concurrency", type=int, default=8, help="Max concurrent HTTP requests")
    parser.add_argument(
        "--verify", action="store_true",
        help="Re-fetch each discovered county's URL and ask a local LLM to confirm it's real "
        "and belongs to the claimed jurisdiction (requires --full/--sample run first)",
    )
    parser.add_argument(
        "--verify-all", action="store_true",
        help="With --verify, also verify counties with no source_urls (default: skip, nothing to check)",
    )
    parser.add_argument("--llm-concurrency", type=int, default=2, help="Max concurrent local LLM calls")
    args = parser.parse_args()

    if args.validate:
        return run_validate()

    if args.verify:
        asyncio.run(run_verify(not args.verify_all, args.llm_concurrency, args.concurrency))
        return 0

    all_entries = load_us_locations()
    if args.full:
        entries = all_entries
    elif args.sample:
        entries = sample_entries(all_entries, args.sample)
    else:
        parser.print_help()
        return 1

    asyncio.run(run_discovery(entries, args.concurrency))
    return 0


if __name__ == "__main__":
    sys.exit(main())
