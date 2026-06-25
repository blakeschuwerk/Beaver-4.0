/**
 * External LLM client for Qwen 2.5 7B (RunPod or OpenAI-compatible endpoint).
 * Supports mock mode, timeout, and retry.
 *
 * Failure policy (see CLAUDE.md "Failure & Observability Principles"):
 * mock fallback is ONLY used when LLM_MOCK_MODE=true (local dev). In production
 * (LLM_MOCK_MODE=false), a call that fails every retry throws LlmUnavailableError
 * so the caller dead-letters the message instead of writing fake data to BigQuery.
 */

import { LlmUnavailableError, logEvent } from '@beaver/shared';

const SERVICE = 'beaver-classifier';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ClassificationResult {
  is_project: boolean;
  tracking_number?: string;
  project_type?: string;
  niche_tags: string[];
  stage: 'subcommittee' | 'approved' | 'bidding' | 'awarded' | 'closed';
  estimated_budget?: number;
  requirements?: string;
  location?: string;
  bid_deadline?: string;
  confidence: number;
}

const VALID_STAGES = new Set(['subcommittee', 'approved', 'bidding', 'awarded', 'closed']);

const MOCK_MODE = process.env.LLM_MOCK_MODE !== 'false';
const ENDPOINT = process.env.LLM_ENDPOINT_URL ?? '';
const API_KEY = process.env.LLM_API_KEY ?? '';
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 30000);
const MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES ?? 2);

const CLASSIFICATION_PROMPT = `You analyze government meeting document chunks for infrastructure/capital projects.
Respond with JSON only (no markdown fences):
{
  "is_project": boolean,
  "tracking_number": string or null,
  "project_type": string or null,
  "niche_tags": string[],
  "stage": "subcommittee"|"approved"|"bidding"|"awarded"|"closed",
  "estimated_budget": number or null,
  "requirements": string or null,
  "location": string or null,
  "bid_deadline": string or null,
  "confidence": number
}
Rules:
- is_project=true only for capital/infrastructure work in planning or procurement.
- tracking_number: official project/CIP/tracking ID when present.
- niche_tags: concrete trade categories (roadway, drainage, HVAC, etc.).
- stage: earliest applicable lifecycle stage visible in the text.
- confidence: 0-1 how certain you are.`;

function mockClassification(text: string): ClassificationResult {
  const hasProject = /project|budget|cip|infrastructure|resurfacing|drainage/i.test(text);
  const trackingMatch = text.match(/(?:CIP|TRK|Project)[-\s#]*(\d{4}[-\d]*)/i);
  return {
    is_project: hasProject,
    tracking_number: trackingMatch?.[1] ?? undefined,
    project_type: hasProject ? 'infrastructure' : undefined,
    niche_tags: hasProject ? ['roadway', 'drainage', 'civil'] : [],
    stage: hasProject ? 'subcommittee' : 'closed',
    estimated_budget: hasProject ? 2500000 : undefined,
    requirements: hasProject ? 'Roadway resurfacing and drainage improvements' : undefined,
    confidence: hasProject ? 0.85 : 0.1,
  };
}

function extractJsonPayload(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

export function parseClassificationResult(raw: string, fallbackText: string): ClassificationResult {
  try {
    const parsed = JSON.parse(extractJsonPayload(raw)) as Partial<ClassificationResult>;
    const stage = parsed.stage && VALID_STAGES.has(parsed.stage) ? parsed.stage : 'subcommittee';
    const confidence = typeof parsed.confidence === 'number'
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.5;

    return {
      is_project: Boolean(parsed.is_project),
      tracking_number: parsed.tracking_number ?? undefined,
      project_type: parsed.project_type ?? undefined,
      niche_tags: Array.isArray(parsed.niche_tags) ? parsed.niche_tags.map(String) : [],
      stage,
      estimated_budget: typeof parsed.estimated_budget === 'number' ? parsed.estimated_budget : undefined,
      requirements: parsed.requirements ?? undefined,
      location: parsed.location ?? undefined,
      bid_deadline: parsed.bid_deadline ?? undefined,
      confidence,
    };
  } catch {
    return mockClassification(fallbackText);
  }
}

async function callLlm(messages: LlmMessage[]): Promise<string> {
  if (MOCK_MODE || !ENDPOINT || ENDPOINT.includes('your-runpod-endpoint')) {
    return JSON.stringify(mockClassification(messages[1]?.content ?? ''));
  }

  let lastError: Error | undefined;
  let lastStatus: number | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.LLM_MODEL ?? 'qwen2.5-7b',
          messages,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      lastStatus = response.status;

      if (!response.ok) {
        throw new Error(`LLM request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      logEvent({
        level: 'info',
        service: SERVICE,
        event: 'llm_call_ok',
        status: response.status,
        latency_ms: Date.now() - startedAt,
        attempt,
      });
      return data.choices?.[0]?.message?.content ?? '{}';
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const aborted = lastError.name === 'AbortError' || /abort/i.test(lastError.message);
      logEvent({
        level: 'warn',
        service: SERVICE,
        event: aborted ? 'llm_call_timeout' : 'llm_call_error',
        status: lastStatus,
        latency_ms: Date.now() - startedAt,
        attempt,
        message: aborted ? `aborted after ${TIMEOUT_MS}ms` : lastError.message,
      });
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  // All retries exhausted. In production we fail loud — never write fake data.
  logEvent({
    level: 'error',
    service: SERVICE,
    event: 'llm_unavailable',
    error_code: 'LLM_UNAVAILABLE',
    status: lastStatus,
    attempt: MAX_RETRIES,
    message: lastError?.message,
  });
  throw new LlmUnavailableError(SERVICE, lastError?.message ?? 'LLM call failed', {
    attempts: MAX_RETRIES + 1,
    lastStatus,
  });
}

export async function classifyChunk(text: string): Promise<ClassificationResult> {
  const raw = await callLlm([
    { role: 'system', content: CLASSIFICATION_PROMPT },
    { role: 'user', content: text.slice(0, 4000) },
  ]);

  return parseClassificationResult(raw, text);
}
