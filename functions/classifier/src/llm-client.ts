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

const MOCK_MODE = process.env.LLM_MOCK_MODE === 'true' || process.env.MOCK_MODE === 'true';
const ENDPOINT = process.env.LLM_ENDPOINT_URL ?? '';
const API_KEY = process.env.LLM_API_KEY ?? '';
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 30000);
const MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES ?? 2);

const CLASSIFICATION_PROMPT = `Analyze this government meeting document chunk. Respond with JSON only:
{
  "is_project": boolean,
  "tracking_number": string or null,
  "project_type": string or null,
  "niche_tags": string[],
  "stage": "subcommittee"|"approved"|"bidding"|"awarded"|"closed",
  "estimated_budget": number or null,
  "requirements": string or null,
  "location": string or null,
  "bid_deadline": string or null (ISO date),
  "confidence": number 0-1
}
A project describes infrastructure/capital work in planning or procurement.`;

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

async function callLlm(messages: LlmMessage[]): Promise<string> {
  if (MOCK_MODE || !ENDPOINT) {
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
          model: 'llama-3-8b',
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

  try {
    const parsed = JSON.parse(raw) as ClassificationResult;
    return {
      is_project: Boolean(parsed.is_project),
      tracking_number: parsed.tracking_number,
      project_type: parsed.project_type,
      niche_tags: parsed.niche_tags ?? [],
      stage: parsed.stage ?? 'subcommittee',
      estimated_budget: parsed.estimated_budget,
      requirements: parsed.requirements,
      location: parsed.location,
      bid_deadline: parsed.bid_deadline,
      confidence: parsed.confidence ?? 0.5,
    };
  } catch {
    return mockClassification(text);
  }
}
