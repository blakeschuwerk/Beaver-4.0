/**
 * External LLM client for Llama-3 (RunPod or OpenAI-compatible endpoint).
 * Supports mock mode, timeout, and retry.
 */

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

const MOCK_MODE = process.env.LLM_MOCK_MODE === 'true' || process.env.MOCK_MODE === 'true';
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
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
          model: process.env.LLM_MODEL ?? 'llama-3-8b',
          messages,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`LLM request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content ?? '{}';
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  console.warn('LLM call failed, falling back to mock classification:', lastError?.message);
  return JSON.stringify(mockClassification(messages[1]?.content ?? ''));
}

export async function classifyChunk(text: string): Promise<ClassificationResult> {
  const raw = await callLlm([
    { role: 'system', content: CLASSIFICATION_PROMPT },
    { role: 'user', content: text.slice(0, 4000) },
  ]);

  return parseClassificationResult(raw, text);
}
