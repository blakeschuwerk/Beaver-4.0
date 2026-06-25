#!/usr/bin/env node
/**
 * Run a single chunk of text through the classifier LLM and print the raw
 * result. For testing CLASSIFICATION_PROMPT changes or chunking-fix output
 * against one specific problem chunk, without paying for a full sandbox run
 * (Docling extraction + every other chunk in the document).
 *
 * Usage: pnpm classify:one -- "chunk text here"
 *        pnpm classify:one -- --file path/to/chunk.txt
 * Requires: pnpm build, .env.local
 */

import { readFileSync } from 'node:fs';
import { loadEnvLocal } from './load-env-local.mjs';

loadEnvLocal();

// Dynamic import AFTER loadEnvLocal(): llm-client.js reads LLM_MOCK_MODE into a
// module-level const at import time, so a static import here (hoisted before
// this file's own statements run) would freeze MOCK_MODE=true regardless of
// .env.local — silently mocking every call. See DEBUG-LOG.md.
const { classifyChunk } = await import('../functions/classifier/dist/llm-client.js');

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: pnpm classify:one -- "chunk text here"');
    console.error('       pnpm classify:one -- --file path/to/chunk.txt');
    process.exit(1);
  }

  const text = args[0] === '--file' ? readFileSync(args[1], 'utf8') : args.join(' ');

  console.log('--- Input ---');
  console.log(text);
  console.log('\n--- Classification ---');

  const start = Date.now();
  const result = await classifyChunk(text);
  const durationMs = Date.now() - start;

  console.log(JSON.stringify(result, null, 2));
  console.log(`\n(${durationMs}ms)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
