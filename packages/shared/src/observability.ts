/**
 * Shared observability primitives for the Beaver pipeline.
 *
 * Two goals (see CLAUDE.md "Failure & Observability Principles"):
 *  1. Make failures loud — `LlmUnavailableError` is thrown instead of silently
 *     returning fake data when a production LLM call cannot complete.
 *  2. Make failures readable without a vendor console — `logEvent` emits one-line
 *     JSON to stdout/stderr (auto-parsed by Cloud Logging into jsonPayload) and,
 *     when `BEAVER_ERROR_LOG` is set, appends to a local NDJSON file so they can be
 *     read straight from the repo with `pnpm logs:errors`.
 */

/** Thrown when an LLM call fails after all retries while NOT in mock mode. */
export class LlmUnavailableError extends Error {
  readonly code = 'LLM_UNAVAILABLE';
  readonly service: string;
  readonly attempts: number;
  readonly lastStatus?: number;

  constructor(
    service: string,
    message: string,
    opts: { attempts: number; lastStatus?: number },
  ) {
    super(`[${service}] LLM unavailable after ${opts.attempts} attempt(s): ${message}`);
    this.name = 'LlmUnavailableError';
    this.service = service;
    this.attempts = opts.attempts;
    this.lastStatus = opts.lastStatus;
  }
}

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEvent {
  level: LogLevel;
  /** Originating service, e.g. "beaver-classifier". */
  service: string;
  /** Machine-friendly event name, e.g. "llm_unavailable", "llm_call_timeout". */
  event: string;
  trace_id?: string;
  county_id?: string;
  error_code?: string;
  /** HTTP status of an outbound call, when applicable. */
  status?: number;
  /** Wall-clock duration of the operation in ms, when applicable. */
  latency_ms?: number;
  /** Retry attempt index (0-based), when applicable. */
  attempt?: number;
  message?: string;
  [key: string]: unknown;
}

/** Best-effort append to a local NDJSON sink. No-op unless BEAVER_ERROR_LOG is set. */
function appendLocalSink(line: string): void {
  if (typeof process === 'undefined') return;
  const path = process.env.BEAVER_ERROR_LOG;
  if (!path) return;
  // Lazy + async so this module stays free of static node:fs imports (keeps
  // frontend/browser bundlers from choking on it). Fire-and-forget.
  void import('node:fs')
    .then((fs) => {
      try {
        fs.appendFileSync(path, line + '\n');
      } catch {
        /* sink is best-effort; never let logging throw */
      }
    })
    .catch(() => {});
}

/** Emit one structured log line. Errors go to stderr, everything else to stdout. */
export function logEvent(event: LogEvent): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event });
  if (event.level === 'error') {
    console.error(line);
    appendLocalSink(line);
  } else if (event.level === 'warn') {
    console.warn(line);
    appendLocalSink(line);
  } else {
    console.log(line);
  }
}
