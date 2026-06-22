import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseClassificationResult } from './llm-client.js';

describe('parseClassificationResult', () => {
  it('parses valid JSON classification', () => {
    const raw = JSON.stringify({
      is_project: true,
      tracking_number: '2024-042',
      project_type: 'infrastructure',
      niche_tags: ['roadway'],
      stage: 'subcommittee',
      estimated_budget: 1000000,
      confidence: 0.9,
    });

    const result = parseClassificationResult(raw, 'fallback');
    assert.equal(result.is_project, true);
    assert.equal(result.tracking_number, '2024-042');
    assert.equal(result.stage, 'subcommittee');
    assert.equal(result.confidence, 0.9);
  });

  it('extracts JSON from markdown fences', () => {
    const raw = '```json\n{"is_project":false,"niche_tags":[],"stage":"closed","confidence":0.2}\n```';
    const result = parseClassificationResult(raw, 'no project here');
    assert.equal(result.is_project, false);
    assert.equal(result.confidence, 0.2);
  });

  it('falls back to mock on invalid JSON', () => {
    const result = parseClassificationResult('not json', 'CIP-2024-042 budget drainage');
    assert.equal(result.is_project, true);
    assert.ok(result.niche_tags.length > 0);
  });

  it('clamps confidence to 0-1', () => {
    const raw = JSON.stringify({
      is_project: true,
      niche_tags: [],
      stage: 'approved',
      confidence: 1.5,
    });
    const result = parseClassificationResult(raw, '');
    assert.equal(result.confidence, 1);
  });
});
