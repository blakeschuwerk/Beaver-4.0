import pdfParse from 'pdf-parse';
import type { ProjectCreatedMessage, UserProfile } from '@beaver/shared';
import { classifyChunk } from '@beaver/classifier/dist/llm-client.js';
import { scoreProjectRelevance } from '@beaver/personalization/dist/llm-client.js';

export interface SandboxChunk {
  chunk_id: string;
  parent_chunk_id?: string;
  text: string;
  is_parent: boolean;
}

export interface PipelineTrace {
  job_id: string;
  status: 'running' | 'complete' | 'error';
  error?: string;
  steps: {
    scraper: {
      documents_discovered: number;
      doc_type: string;
      circuit_breaker: string;
    };
    extraction: {
      parent_chunks: number;
      child_chunks: number;
      text_preview: string;
      chunks: SandboxChunk[];
    };
    classifier_filter: Array<{
      chunk_id: string;
      text_preview: string;
      is_project: boolean;
    }>;
    classifier_extraction: Record<string, unknown> | null;
    relevance: {
      relevance_score: number;
      match_percent: number;
      rationale?: string;
    } | null;
  };
}

const traceCache = new Map<string, PipelineTrace>();

export function getTrace(jobId: string): PipelineTrace | undefined {
  return traceCache.get(jobId);
}

function chunkText(text: string, chunkSize = 1500, overlap = 200): SandboxChunk[] {
  const chunks: SandboxChunk[] = [];
  let parentIdx = 0;
  let pos = 0;

  while (pos < text.length) {
    const parentId = `parent-${parentIdx}`;
    const parentEnd = Math.min(pos + chunkSize * 3, text.length);
    const parentText = text.slice(pos, parentEnd);
    chunks.push({
      chunk_id: parentId,
      text: parentText.slice(0, 200),
      is_parent: true,
    });

    let childPos = 0;
    let childIdx = 0;
    while (childPos < parentText.length) {
      const childText = parentText.slice(childPos, childPos + chunkSize);
      if (childText.trim().length > 50) {
        chunks.push({
          chunk_id: `${parentId}-child-${childIdx}`,
          parent_chunk_id: parentId,
          text: childText,
          is_parent: false,
        });
        childIdx++;
      }
      childPos += chunkSize - overlap;
    }

    pos = parentEnd - overlap;
    parentIdx++;
    if (parentIdx > 20) break;
  }

  return chunks;
}

function guessDocType(url?: string, filename?: string): string {
  const source = (url ?? filename ?? '').toLowerCase();
  if (source.includes('minutes')) return 'minutes';
  if (source.includes('agenda')) return 'agenda';
  if (source.includes('packet')) return 'packet';
  if (source.includes('rfp')) return 'rfp';
  return 'other';
}

async function extractFromUrl(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Beaver/4.0 Sandbox' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Failed to fetch URL: ${response.status}`);

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('pdf') || url.toLowerCase().endsWith('.pdf')) {
    const buffer = Buffer.from(await response.arrayBuffer());
    const parsed = await pdfParse(buffer);
    return parsed.text;
  }

  const text = await response.text();
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function extractFromPdf(buffer: Buffer): Promise<string> {
  const parsed = await pdfParse(buffer);
  return parsed.text;
}

export async function runSandboxPipeline(options: {
  jobId: string;
  url?: string;
  pdfBuffer?: Buffer;
  profile: UserProfile;
}): Promise<PipelineTrace> {
  const trace: PipelineTrace = {
    job_id: options.jobId,
    status: 'running',
    steps: {
      scraper: { documents_discovered: 0, doc_type: 'other', circuit_breaker: 'n/a (sandbox)' },
      extraction: { parent_chunks: 0, child_chunks: 0, text_preview: '', chunks: [] },
      classifier_filter: [],
      classifier_extraction: null,
      relevance: null,
    },
  };

  traceCache.set(options.jobId, trace);

  try {
    let text = '';
    if (options.pdfBuffer) {
      text = await extractFromPdf(options.pdfBuffer);
      trace.steps.scraper.doc_type = guessDocType(undefined, 'upload.pdf');
    } else if (options.url) {
      text = await extractFromUrl(options.url);
      trace.steps.scraper.doc_type = guessDocType(options.url);
    } else {
      throw new Error('Provide url or PDF upload');
    }

    trace.steps.scraper.documents_discovered = 1;

    const chunks = chunkText(text);
    const parents = chunks.filter((c) => c.is_parent);
    const children = chunks.filter((c) => !c.is_parent);

    trace.steps.extraction = {
      parent_chunks: parents.length,
      child_chunks: children.length,
      text_preview: text.slice(0, 500),
      chunks: children.slice(0, 10),
    };

    const childChunks = children.slice(0, 5);
    const filterResults = [];

    for (const chunk of childChunks) {
      const result = await classifyChunk(chunk.text);
      filterResults.push({
        chunk_id: chunk.chunk_id,
        text_preview: chunk.text.slice(0, 120),
        is_project: result.is_project,
      });

      if (result.is_project && !trace.steps.classifier_extraction) {
        trace.steps.classifier_extraction = {
          tracking_number: result.tracking_number,
          project_type: result.project_type,
          niche_tags: result.niche_tags,
          stage: result.stage,
          estimated_budget: result.estimated_budget,
          requirements: result.requirements,
          location: result.location,
          bid_deadline: result.bid_deadline,
          confidence: result.confidence,
        };

        const projectMsg: ProjectCreatedMessage = {
          schema_version: '1.0.0',
          trace_id: options.jobId,
          published_at: new Date().toISOString(),
          project_id: `sandbox-${options.jobId}`,
          tracking_number: result.tracking_number,
          county_id: options.profile.geography[0] ?? 'sandbox',
          niche_tags: result.niche_tags,
          stage: result.stage,
          document_id: `sandbox-doc-${options.jobId}`,
          chunk_ids: [chunk.chunk_id],
        };

        const relevance = await scoreProjectRelevance(options.profile, projectMsg);
        trace.steps.relevance = {
          relevance_score: relevance.relevance_score,
          match_percent: Math.round(relevance.relevance_score * 100),
          rationale: relevance.rationale,
        };
      }
    }

    trace.steps.classifier_filter = filterResults;
    trace.status = 'complete';
  } catch (error) {
    trace.status = 'error';
    trace.error = error instanceof Error ? error.message : String(error);
  }

  traceCache.set(options.jobId, trace);
  return trace;
}
