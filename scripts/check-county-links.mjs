#!/usr/bin/env node
/**
 * Validate county source_urls are reachable (HTTP HEAD/GET).
 * Usage: node scripts/check-county-links.mjs [--county-id=<id>]
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const configPath = join(dirname(fileURLToPath(import.meta.url)), '../config/counties.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));

const countyFilter = process.argv.find((a) => a.startsWith('--county-id='))?.split('=')[1];

async function checkUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url, { method: 'GET', signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeout);
    return { url, ok: resp.ok, status: resp.status };
  } catch (err) {
    clearTimeout(timeout);
    return { url, ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const counties = countyFilter
    ? config.counties.filter((c) => c.county_id === countyFilter)
    : config.counties;

  if (counties.length === 0) {
    console.error(`No counties matched filter: ${countyFilter ?? '(none)'}`);
    process.exit(1);
  }

  let failures = 0;
  for (const county of counties) {
    console.log(`\n=== ${county.county_id} (${county.name}) ===`);
    for (const url of county.source_urls) {
      const result = await checkUrl(url);
      if (result.ok) {
        console.log(`  OK  ${result.status}  ${url}`);
      } else {
        failures += 1;
        console.log(`  FAIL ${result.status}  ${url}${result.error ? ` — ${result.error}` : ''}`);
      }
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} URL(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll URLs reachable.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
