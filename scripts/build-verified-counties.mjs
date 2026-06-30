#!/usr/bin/env node
/**
 * Build the frontend's verified-counties dataset from the discovery run.
 *
 * Source of truth: local-run/verified-counties.json (output of `pnpm discover:counties:verify`).
 * We keep only entries with verified_ok === true (~730), and recover each one's
 * canonical US county label from packages/shared/data/us_locations.json by
 * computing the same county_id slug the Python discovery used (scripts/county_discovery/slugs.py).
 *
 * Output: packages/shared/data/verified_counties.json — [{ county_id, label, state, url, platform }]
 * Imported by the frontend so the Testing Console can only select verified counties.
 *
 * Re-run after a new discovery pass:  node scripts/build-verified-counties.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERIFIED_IN = join(ROOT, 'local-run', 'verified-counties.json');
const US_LOCATIONS = join(ROOT, 'packages', 'shared', 'data', 'us_locations.json');
const OUT = join(ROOT, 'packages', 'shared', 'data', 'verified_counties.json');

// Mirror of scripts/county_discovery/slugs.py normalize_name + parse_location_entry.
const SUFFIX = /\b(County|Parish|Borough|Census Area|Municipality|City and Borough)\b/gi;
function normalizeName(raw) {
  return raw.replace(SUFFIX, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}
function countyIdFromLabel(label) {
  const idx = label.lastIndexOf(', ');
  if (idx < 0) return null;
  const namePart = label.slice(0, idx);
  const state = label.slice(idx + 2).toUpperCase();
  return `${state.toLowerCase()}-${normalizeName(namePart)}`;
}

const verifiedRaw = JSON.parse(readFileSync(VERIFIED_IN, 'utf8'));
const verifiedEntries = (verifiedRaw.counties ?? verifiedRaw).filter((c) => c.verified_ok === true);
const byId = new Map(verifiedEntries.map((c) => [c.county_id, c]));

const usLocations = JSON.parse(readFileSync(US_LOCATIONS, 'utf8'));
const out = [];
const matchedIds = new Set();
for (const labels of Object.values(usLocations)) {
  for (const label of labels) {
    const countyId = countyIdFromLabel(label);
    const entry = countyId && byId.get(countyId);
    if (!entry || matchedIds.has(countyId)) continue;
    matchedIds.add(countyId);
    out.push({
      county_id: countyId,
      label,
      state: label.slice(label.lastIndexOf(', ') + 2).toUpperCase(),
      url: entry.claimed_url,
      platform: entry.detected_platform ?? entry.claimed_platform ?? null,
    });
  }
}
out.sort((a, b) => a.label.localeCompare(b.label));

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

const unmatched = verifiedEntries.filter((c) => !matchedIds.has(c.county_id));
console.log(`verified_ok entries: ${verifiedEntries.length}`);
console.log(`mapped to a us_locations label: ${out.length}`);
if (unmatched.length) {
  console.log(`UNMATCHED (${unmatched.length}) — county_id had no us_locations label:`);
  for (const c of unmatched.slice(0, 20)) console.log(`  ${c.county_id} (${c.detected_jurisdiction_text ?? '?'})`);
}
console.log(`wrote ${OUT}`);
