import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PipelineTrace } from './pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const RUN_LOG_PATH = path.join(REPO_ROOT, 'local-run', 'sandbox-runs.ndjson');

export interface SandboxRunSummary {
  job_id: string;
  status: PipelineTrace['status'];
  timestamp: string;
  doc_source: string;
  total_duration_ms: number;
  projects_count: number;
  top_relevance_score: number;
}

function summarizeTrace(trace: PipelineTrace, docSource: string, startedAt: number): SandboxRunSummary {
  const relevanceScores = trace.steps.relevance.map((r) => r.relevance_score);
  return {
    job_id: trace.job_id,
    status: trace.status,
    timestamp: new Date(startedAt).toISOString(),
    doc_source: docSource,
    total_duration_ms: Date.now() - startedAt,
    projects_count: trace.steps.classifier_extraction.length,
    top_relevance_score: relevanceScores.length > 0 ? Math.max(...relevanceScores) : 0,
  };
}

/** Best-effort append to local NDJSON sink. Never throws. */
export function appendRunLog(trace: PipelineTrace, docSource: string, startedAt: number): void {
  try {
    const line = JSON.stringify(summarizeTrace(trace, docSource, startedAt));
    void import('node:fs')
      .then((fs) => {
        try {
          fs.appendFileSync(RUN_LOG_PATH, line + '\n');
        } catch {
          /* sink is best-effort; never let logging throw */
        }
      })
      .catch(() => {});
  } catch {
    /* never let logging throw */
  }
}

export function listRunLog(limit = 50): SandboxRunSummary[] {
  try {
    const raw = readFileSync(RUN_LOG_PATH, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const runs = lines
      .map((line) => {
        try {
          return JSON.parse(line) as SandboxRunSummary;
        } catch {
          return null;
        }
      })
      .filter((run): run is SandboxRunSummary => run !== null);
    return runs.reverse().slice(0, limit);
  } catch {
    return [];
  }
}
