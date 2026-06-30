"""Pure-function tests for verify.py — no network/LLM calls."""

from __future__ import annotations

from scripts.county_discovery.verify import (
    build_verify_messages,
    jurisdiction_text_matches,
    parse_verify_response,
)


def test_build_verify_messages_includes_claim_and_body():
    messages = build_verify_messages("Denton County", "TX", "civicplus", "<html>agenda center</html>")
    assert messages[0]["role"] == "system"
    user = messages[1]["content"]
    assert "Denton County, TX" in user
    assert "civicplus" in user
    assert "agenda center" in user


def test_parse_verify_response_plain_json():
    raw = (
        '{"detected_jurisdiction_text": "Denton County, TX", "is_real_portal": true, '
        '"detected_platform": "civicplus", "reasoning": "title says Denton County, TX"}'
    )
    parsed = parse_verify_response(raw)
    assert parsed["detected_jurisdiction_text"] == "Denton County, TX"
    assert parsed["is_real_portal"] is True
    assert parsed["detected_platform"] == "civicplus"


def test_parse_verify_response_with_fenced_markdown():
    raw = '```json\n{"detected_jurisdiction_text": null, "is_real_portal": false, ' \
          '"detected_platform": "none", "reasoning": "parked domain"}\n```'
    parsed = parse_verify_response(raw)
    assert parsed["is_real_portal"] is False
    assert parsed["detected_jurisdiction_text"] is None
    assert parsed["detected_platform"] == "none"


def test_parse_verify_response_lowercases_platform():
    raw = (
        '{"detected_jurisdiction_text": "x", "is_real_portal": true, '
        '"detected_platform": "CivicPlus", "reasoning": "x"}'
    )
    parsed = parse_verify_response(raw)
    assert parsed["detected_platform"] == "civicplus"


def test_parse_verify_response_missing_fields_defaults_safe():
    parsed = parse_verify_response("{}")
    assert parsed["is_real_portal"] is False
    assert parsed["detected_jurisdiction_text"] is None
    assert parsed["detected_platform"] == "none"
    assert parsed["reasoning"] == ""


def test_jurisdiction_text_matches_exact():
    assert jurisdiction_text_matches("Jackson County", "AL", "Jackson County, AL") is True


def test_jurisdiction_text_matches_title_format():
    text = "Agenda Center • Jackson County, AL • CivicEngage"
    assert jurisdiction_text_matches("Jackson County", "AL", text) is True


def test_jurisdiction_text_rejects_wrong_entity_same_state():
    # Real bug this is designed to catch: cherokee.legistar.com is the Cherokee
    # Nation, not Cherokee County, AL — both could mention "Cherokee" but the
    # extracted text won't actually say "Cherokee County, AL".
    assert jurisdiction_text_matches("Cherokee County", "AL", "Council of the Cherokee Nation") is False


def test_jurisdiction_text_rejects_wrong_state():
    assert jurisdiction_text_matches("Jackson County", "AL", "Jackson County, MS") is False


def test_jurisdiction_text_matches_none_input():
    assert jurisdiction_text_matches("Jackson County", "AL", None) is False
