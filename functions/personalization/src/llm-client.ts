/**
 * LLM relevance scoring for F5 personalization (RunPod / OpenAI-compatible).
 */

import type { ProjectCreatedMessage, UserProfile } from '@beaver/shared';

export interface RelevanceResult {
  relevance_score: number;
  rationale?: string;
}

const MOCK_MODE = process.env.LLM_MOCK_MODE === 'true' || process.env.MOCK_MODE === 'true';
const ENDPOINT = process.env.LLM_ENDPOINT_URL ?? '';
const API_KEY = process.env.LLM_API_KEY ?? '';
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 30000);
const MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES ?? 2);

const RELEVANCE_PROMPT = `You score how relevant a government infrastructure project is for a contractor profile.
Respond with JSON only:
{
  "relevance_score": number,
  "rationale": string
}
Rules:
- relevance_score: 0.0 to 1.0 (1.0 = perfect fit for this contractor's services and geography).
- Consider service_categories overlap with project niche_tags and geography overlap with county.
- Score below 0.3 when there is no meaningful overlap.`;

function mockRelevance(user: UserProfile, project: ProjectCreatedMessage): RelevanceResult {
  const categoryOverlap = user.service_categories.some((cat) =>
    project.niche_tags.some((tag) =>
      tag.toLowerCase().includes(cat.toLowerCase()) || cat.toLowerCase().includes(tag.toLowerCase()),
    ),
  );
  const geoOverlap = user.geography.some(
    (geo) => geo.toLowerCase() === project.county_id.toLowerCase(),
  );

  if (categoryOverlap && geoOverlap) {
    return { relevance_score: 0.85, rationale: 'Strong niche and geography overlap (mock)' };
  }
  if (categoryOverlap || geoOverlap) {
    return { relevance_score: 0.65, rationale: 'Partial overlap (mock)' };
  }
  return { relevance_score: 0.2, rationale: 'No meaningful overlap (mock)' };
}

function extractJsonPayload(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

export function parseRelevanceResult(
  raw: string,
  user: UserProfile,
  project: ProjectCreatedMessage,
): RelevanceResult {
  try {
    const parsed = JSON.parse(extractJsonPayload(raw)) as Partial<RelevanceResult>;
    const score = typeof parsed.relevance_score === 'number'
      ? Math.min(1, Math.max(0, parsed.relevance_score))
      : 0.5;
    return {
      relevance_score: score,
      rationale: parsed.rationale,
    };
  } catch {
    return mockRelevance(user, project);
  }
}

async function callLlm(systemPrompt: string, userContent: string): Promise<string> {
  if (MOCK_MODE || !ENDPOINT || ENDPOINT.includes('your-runpod-endpoint')) {
    return '{}';
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
          model: process.env.LLM_MODEL ?? 'qwen2.5-7b',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
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

  console.warn('LLM relevance call failed, using heuristic fallback:', lastError?.message);
  return '{}';
}

export async function scoreProjectRelevance(
  user: UserProfile,
  project: ProjectCreatedMessage,
): Promise<RelevanceResult> {
  if (MOCK_MODE || !ENDPOINT || ENDPOINT.includes('your-runpod-endpoint')) {
    return mockRelevance(user, project);
  }

  const userContent = JSON.stringify({
    contractor: {
      company: user.company,
      service_categories: user.service_categories,
      geography: user.geography,
    },
    project: {
      project_id: project.project_id,
      county_id: project.county_id,
      niche_tags: project.niche_tags,
      stage: project.stage,
      tracking_number: project.tracking_number,
    },
  });

  const raw = await callLlm(RELEVANCE_PROMPT, userContent);
  if (raw === '{}') {
    return mockRelevance(user, project);
  }
  return parseRelevanceResult(raw, user, project);
}
