"""LLM-based verification of discovered county portal URLs.

The regex heuristic in classify.py can tell "this page has Legistar markers and
is 150KB" but it cannot tell whose meetings page it is. A wildcard vendor
subdomain guess can land on a *real* portal for the *wrong* jurisdiction (name
collisions like "Washington County" exist in a dozen states). This module
re-fetches each candidate URL and asks a local Qwen model (via Ollama's
OpenAI-compatible endpoint, same one functions/classifier uses in prod) to
read the actual page and judge: is this a real, live meeting/agenda portal,
and does it actually belong to the claimed county?
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import aiohttp

from .slugs import normalize_name

if TYPE_CHECKING:
    from .probe import PoliteProber

logger = logging.getLogger(__name__)

LLM_ENDPOINT = os.environ.get("LLM_ENDPOINT_URL", "http://localhost:11434/v1/chat/completions")
LLM_MODEL = os.environ.get("LLM_MODEL", "qwen2.5:7b")
LLM_TIMEOUT_SEC = int(os.environ.get("LLM_VERIFY_TIMEOUT_SEC", "60"))
VERIFY_BODY_CHARS = 6000

VERIFY_SYSTEM_PROMPT = """You inspect a fetched government webpage and extract two facts. \
Respond with JSON only, no markdown fences:
{
  "detected_jurisdiction_text": string or null,
  "is_real_portal": boolean,
  "detected_platform": "legistar"|"civicplus"|"novusagenda"|"escribe"|"granicus"|"iqm2"|"boarddocs"|"other"|"none",
  "reasoning": string
}
Rules:
- detected_jurisdiction_text: quote the EXACT government/place name and state you see identifying
  whose page this is, from ANYWHERE in the snippet — a <title>, banner, heading, meta tag, or
  analytics/tracking config variable (e.g. a Google Analytics custom dimension naming the
  county) all count. Verbatim, do not interpret or compare it to anything. null only if no
  jurisdiction name appears anywhere in the snippet at all.
- is_real_portal: true only if this looks like a real, live government meeting/agenda/document
  page (not a parked domain, generic vendor shell, error page, or unrelated site). A page can be
  is_real_portal=true even if it's mostly tracking scripts in this snippet, as long as a genuine
  government jurisdiction name and vendor branding are present — the actual meeting list may be
  rendered by JavaScript not visible in raw HTML.
- detected_platform: your own independent read of the platform from the page content.
- reasoning: one sentence, specific (quote what jurisdiction text you saw, if any)."""


@dataclass
class VerificationResult:
    county_id: str
    claimed_platform: str
    claimed_url: str
    http_status: int
    is_real_portal: bool
    jurisdiction_matches: bool
    detected_jurisdiction_text: str | None
    detected_platform: str
    platform_agrees: bool
    verified_ok: bool
    reasoning: str
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "county_id": self.county_id,
            "claimed_platform": self.claimed_platform,
            "claimed_url": self.claimed_url,
            "http_status": self.http_status,
            "is_real_portal": self.is_real_portal,
            "jurisdiction_matches": self.jurisdiction_matches,
            "detected_jurisdiction_text": self.detected_jurisdiction_text,
            "detected_platform": self.detected_platform,
            "platform_agrees": self.platform_agrees,
            "verified_ok": self.verified_ok,
            "reasoning": self.reasoning,
            "error": self.error,
        }


def build_verify_messages(
    name: str, state: str, claimed_platform: str, body: str,
) -> list[dict[str, str]]:
    user_content = (
        f"Claimed jurisdiction: {name}, {state}\n"
        f"Claimed platform: {claimed_platform}\n"
        f"Page content snippet:\n{body[:VERIFY_BODY_CHARS]}"
    )
    return [
        {"role": "system", "content": VERIFY_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


def parse_verify_response(raw: str) -> dict[str, Any]:
    """Pure parser, extracted so it's unit-testable without a network/LLM call."""
    start = raw.find("{")
    end = raw.rfind("}")
    payload = raw[start : end + 1] if start >= 0 and end > start else raw
    parsed = json.loads(payload)
    detected_text = parsed.get("detected_jurisdiction_text")
    return {
        "detected_jurisdiction_text": str(detected_text) if detected_text else None,
        "is_real_portal": bool(parsed.get("is_real_portal")),
        "detected_platform": str(parsed.get("detected_platform", "none")).lower(),
        "reasoning": str(parsed.get("reasoning", "")),
    }


def jurisdiction_text_matches(claimed_name: str, claimed_state: str, detected_text: str | None) -> bool:
    """Deterministic comparison of the LLM-extracted jurisdiction text against the claim.

    Computed in Python rather than asked of the LLM directly — a 7B local model proved
    unreliable at keeping a yes/no judgment consistent with its own extracted evidence
    (e.g. extracting "Jackson County, AL" verbatim but still answering "matches: false").
    Comparing the raw extracted text ourselves removes that failure mode.
    """
    if not detected_text:
        return False
    normalized_claimed = normalize_name(claimed_name)
    normalized_detected = re.sub(r"[^a-z0-9]", "", detected_text.lower())
    name_ok = bool(normalized_claimed) and normalized_claimed in normalized_detected
    state_ok = bool(re.search(rf"\b{re.escape(claimed_state)}\b", detected_text, re.IGNORECASE))
    return name_ok and state_ok


async def call_llm(session: aiohttp.ClientSession, messages: list[dict[str, str]]) -> str:
    async with session.post(
        LLM_ENDPOINT,
        json={
            "model": LLM_MODEL,
            "messages": messages,
            "temperature": 0.0,
            "response_format": {"type": "json_object"},
        },
        timeout=aiohttp.ClientTimeout(total=LLM_TIMEOUT_SEC),
    ) as resp:
        resp.raise_for_status()
        data = await resp.json()
        return data["choices"][0]["message"]["content"]


async def verify_one(
    llm_session: aiohttp.ClientSession,
    llm_semaphore: Any,
    prober: "PoliteProber",
    county: dict[str, Any],
) -> VerificationResult:
    county_id = county["county_id"]
    name = county["name"]
    state = county["state"]
    claimed_platform = county.get("platform", "unknown")
    url = (county.get("source_urls") or [None])[0]

    if not url:
        return VerificationResult(
            county_id=county_id, claimed_platform=claimed_platform, claimed_url="",
            http_status=0, is_real_portal=False, jurisdiction_matches=False,
            detected_jurisdiction_text=None, detected_platform="none",
            platform_agrees=False, verified_ok=False,
            reasoning="no candidate URL to verify",
        )

    status, body, final_url = await prober.fetch(url, check_robots=False)

    if status == 0 or not body:
        return VerificationResult(
            county_id=county_id, claimed_platform=claimed_platform, claimed_url=url,
            http_status=status, is_real_portal=False, jurisdiction_matches=False,
            detected_jurisdiction_text=None, detected_platform="none",
            platform_agrees=False, verified_ok=False,
            reasoning="fetch failed or empty body", error="fetch_failed",
        )

    messages = build_verify_messages(name, state, claimed_platform, body)
    try:
        async with llm_semaphore:
            raw = await call_llm(llm_session, messages)
        parsed = parse_verify_response(raw)
    except Exception as e:  # noqa: BLE001 - research script: log + mark, don't kill the batch
        logger.warning("LLM verify failed for %s: %s", county_id, e)
        return VerificationResult(
            county_id=county_id, claimed_platform=claimed_platform, claimed_url=url,
            http_status=status, is_real_portal=False, jurisdiction_matches=False,
            detected_jurisdiction_text=None, detected_platform="none",
            platform_agrees=False, verified_ok=False,
            reasoning="LLM call/parse failed", error=str(e),
        )

    jurisdiction_matches = jurisdiction_text_matches(
        name, state, parsed["detected_jurisdiction_text"],
    )
    platform_agrees = parsed["detected_platform"] == claimed_platform
    verified_ok = parsed["is_real_portal"] and jurisdiction_matches and platform_agrees

    return VerificationResult(
        county_id=county_id,
        claimed_platform=claimed_platform,
        claimed_url=final_url or url,
        http_status=status,
        is_real_portal=parsed["is_real_portal"],
        jurisdiction_matches=jurisdiction_matches,
        detected_jurisdiction_text=parsed["detected_jurisdiction_text"],
        detected_platform=parsed["detected_platform"],
        platform_agrees=platform_agrees,
        verified_ok=verified_ok,
        reasoning=parsed["reasoning"],
    )
