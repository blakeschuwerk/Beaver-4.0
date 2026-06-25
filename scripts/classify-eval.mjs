#!/usr/bin/env node
/**
 * Run config/classifier-golden-set.json through the real classifier and
 * report pass/fail + accuracy. Turns "does this prompt/chunking change look
 * better" into a number instead of re-reading a full trace by eye.
 *
 * Usage: pnpm classify:eval
 * Requires: pnpm build, .env.local
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvLocal, REPO_ROOT } from './load-env-local.mjs';

loadEnvLocal();

// Dynamic import AFTER loadEnvLocal(): llm-client.js reads LLM_MOCK_MODE into a
// module-level const at import time, so a static import here (hoisted before
// this file's own statements run) would freeze MOCK_MODE=true regardless of
// .env.local — silently mocking every call. See DEBUG-LOG.md.
const { classifyChunk } = await import('../functions/classifier/dist/llm-client.js');

const GOLDEN_SET_PATH = join(REPO_ROOT, 'config', 'classifier-golden-set.json');

async function main() {
  const { examples } = JSON.parse(readFileSync(GOLDEN_SET_PATH, 'utf8'));

  let passed = 0;
  const rows = [];

  for (const example of examples) {
    const start = Date.now();
    const result = await classifyChunk(example.text);
    const durationMs = Date.now() - start;
    const ok = result.is_project === example.expected_is_project;
    if (ok) passed++;

    rows.push({
      id: example.id,
      expected: example.expected_is_project,
      actual: result.is_project,
      ok: ok ? 'PASS' : 'FAIL',
      confidence: result.confidence,
      durationMs,
    });
  }

  console.log('--- Golden set results ---\n');
  for (const row of rows) {
    const marker = row.ok === 'PASS' ? '✓' : '✗';
    console.log(
      `${marker} ${row.ok}  ${row.id}  expected=${row.expected} actual=${row.actual} confidence=${row.confidence} (${row.durationMs}ms)`,
    );
  }

  const accuracy = ((passed / examples.length) * 100).toFixed(1);
  console.log(`\n${passed}/${examples.length} passed (${accuracy}% accuracy)`);

  if (passed < examples.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
