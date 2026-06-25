#!/usr/bin/env node
/**
 * Reads Beaver pipeline errors without opening a vendor console.
 *
 *   pnpm logs:errors            # recent errors from the local NDJSON sink
 *   pnpm logs:errors --prod     # recent errors from production Cloud Logging
 *   pnpm logs:errors --limit=20 # cap the number of entries
 *
 * Both sources share the structured shape emitted by logEvent() in
 * packages/shared/src/observability.ts. See CLAUDE.md "Failure & Observability".
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const prod = args.includes('--prod');
const limit = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 50);
const localPath = process.env.BEAVER_ERROR_LOG ?? 'local-run/errors.ndjson';

function fmt(e) {
  return (
    `${e.ts ?? '?'} [${e.level ?? '?'}] ${e.service ?? '?'} ${e.event ?? '?'}` +
    (e.status ? ` status=${e.status}` : '') +
    (e.latency_ms != null ? ` ${e.latency_ms}ms` : '') +
    (e.attempt != null ? ` attempt=${e.attempt}` : '') +
    (e.message ? ` — ${e.message}` : '')
  );
}

function printLocal() {
  if (!existsSync(localPath)) {
    console.log(`(no local error log at ${localPath} — none recorded yet)`);
    return;
  }
  const lines = readFileSync(localPath, 'utf8').trim().split('\n').filter(Boolean);
  const recent = lines.slice(-limit);
  console.log(`=== Local errors (${recent.length} of ${lines.length}) — ${localPath} ===`);
  for (const line of recent) {
    try {
      console.log(fmt(JSON.parse(line)));
    } catch {
      console.log(line);
    }
  }
}

function printProd() {
  const project = process.env.GCP_PROJECT_ID ?? 'beaver4';
  const filter = [
    'resource.type="cloud_run_revision"',
    'jsonPayload.service:"beaver"',
    '(jsonPayload.level="error" OR jsonPayload.level="warn")',
  ].join(' AND ');
  console.log(`=== Production errors (Cloud Logging · ${project} · last 7d) ===`);
  try {
    const out = execFileSync(
      'gcloud',
      ['logging', 'read', filter, `--project=${project}`, `--limit=${limit}`, '--freshness=7d', '--format=json'],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 },
    );
    const entries = JSON.parse(out);
    if (!entries.length) {
      console.log('(no matching entries)');
      return;
    }
    for (const entry of entries) {
      console.log(fmt({ ...entry.jsonPayload, ts: entry.jsonPayload?.ts ?? entry.timestamp }));
    }
  } catch (err) {
    console.error('Failed to read Cloud Logging (is gcloud installed + authed?):', err.message);
    process.exitCode = 1;
  }
}

if (prod) printProd();
else printLocal();
