import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { ProjectCreatedMessage, UserProfile } from '@beaver/shared';
import { classifyChunk } from '@beaver/classifier/dist/llm-client.js';
import { scoreProjectRelevance } from '@beaver/personalization/dist/llm-client.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const PYTHON_BIN = path.join(REPO_ROOT, '.venv', 'bin', 'python3');
const SANDBOX_EXTRACT_SCRIPT = path.join(REPO_ROOT, 'functions', 'analyzer', 'src', 'sandbox_extract.py');

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
      method: 'docling' | 'mock-text' | 'approximate-html';
      parent_chunks: number;
      child_chunks: number;
      chunks_classified: number;
      chunks_total: number;
      text_preview: string;
      chunks: SandboxChunk[];
    };
    classifier_filter: Array<{
      chunk_id: string;
      text_preview: string;
      is_project: boolean;
    }>;
    classifier_extraction: Array<Record<string, unknown>>;
    relevance: Array<{
      chunk_id: string;
      relevance_score: number;
      match_percent: number;
      rationale?: string;
    }>;
  };
}

const traceCache = new Map<string, PipelineTrace>();

export function getTrace(jobId: string): PipelineTrace | undefined {
  return traceCache.get(jobId);
}

interface RealChunkResult {
  used_docling: boolean;
  text: string;
  chunks: Array<{ chunk_id: string; parent_chunk_id: string | null; text: string; chunk_type: 'parent' | 'child' }>;
}

async function runRealChunking(fileBytes: Buffer, documentId: string): Promise<{ text: string; usedDocling: boolean; chunks: SandboxChunk[] }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'beaver-sandbox-'));
  const filePath = path.join(dir, 'document.pdf');
  try {
    await writeFile(filePath, fileBytes);
    const { stdout } = await execFileAsync(
      PYTHON_BIN,
      [SANDBOX_EXTRACT_SCRIPT, filePath, documentId],
      { env: { ...process.env, USE_DOCLING: 'true' }, maxBuffer: 1024 * 1024 * 50 },
    );
    const result = JSON.parse(stdout) as RealChunkResult;
    return {
      text: result.text,
      usedDocling: result.used_docling,
      chunks: result.chunks.map((c) => ({
        chunk_id: c.chunk_id,
        parent_chunk_id: c.parent_chunk_id ?? undefined,
        text: c.text,
        is_parent: c.chunk_type === 'parent',
      })),
    };
  } catch (error) {
    throw new Error(
      `Real Docling chunking failed — is the local Python venv set up (.venv/bin/python3, docling installed)? ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function chunkPlainText(text: string, chunkSize = 1500): SandboxChunk[] {
  const paragraphs = text.split(/\n\s*\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
  const chunks: SandboxChunk[] = [];
  const parentId = 'parent-0';
  chunks.push({ chunk_id: parentId, text: text.slice(0, 200), is_parent: true });

  let current = '';
  let childIdx = 0;
  const flush = () => {
    if (current.trim().length > 40) {
      chunks.push({ chunk_id: `${parentId}-child-${childIdx}`, parent_chunk_id: parentId, text: current, is_parent: false });
      childIdx++;
    }
    current = '';
  };
  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length > chunkSize && current) {
      flush();
      current = para;
    } else {
      current = candidate;
    }
  }
  flush();
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

async function fetchDocument(url: string): Promise<{ bytes: Buffer } | { text: string }> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Beaver/4.0 Sandbox' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Failed to fetch URL: ${response.status}`);

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('pdf') || url.toLowerCase().endsWith('.pdf')) {
    return { bytes: Buffer.from(await response.arrayBuffer()) };
  }

  const text = await response.text();
  return { text: text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() };
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
      extraction: { method: 'mock-text', parent_chunks: 0, child_chunks: 0, chunks_classified: 0, chunks_total: 0, text_preview: '', chunks: [] },
      classifier_filter: [],
      classifier_extraction: [],
      relevance: [],
    },
  };

  traceCache.set(options.jobId, trace);

  try {
    let text: string;
    let chunks: SandboxChunk[];
    let method: PipelineTrace['steps']['extraction']['method'];

    if (options.pdfBuffer) {
      const result = await runRealChunking(options.pdfBuffer, options.jobId);
      text = result.text;
      chunks = result.chunks;
      method = result.usedDocling ? 'docling' : 'mock-text';
      trace.steps.scraper.doc_type = guessDocType(undefined, 'upload.pdf');
    } else if (options.url) {
      const fetched = await fetchDocument(options.url);
      if ('bytes' in fetched) {
        const result = await runRealChunking(fetched.bytes, options.jobId);
        text = result.text;
        chunks = result.chunks;
        method = result.usedDocling ? 'docling' : 'mock-text';
      } else {
        text = fetched.text;
        chunks = chunkPlainText(text);
        method = 'approximate-html';
      }
      trace.steps.scraper.doc_type = guessDocType(options.url);
    } else {
      throw new Error('Provide url or PDF upload');
    }

    trace.steps.scraper.documents_discovered = 1;

    const parents = chunks.filter((c) => c.is_parent);
    const children = chunks.filter((c) => !c.is_parent);

    trace.steps.extraction = {
      method,
      parent_chunks: parents.length,
      child_chunks: children.length,
      chunks_classified: children.length,
      chunks_total: children.length,
      text_preview: text.slice(0, 500),
      chunks: children.slice(0, 10),
    };

    const filterResults = [];
    const extractions: Array<Record<string, unknown>> = [];
    const relevances: PipelineTrace['steps']['relevance'] = [];

    for (const chunk of children) {
      const result = await classifyChunk(chunk.text);
      filterResults.push({
        chunk_id: chunk.chunk_id,
        text_preview: chunk.text.slice(0, 120),
        is_project: result.is_project,
      });

      if (result.is_project) {
        extractions.push({
          chunk_id: chunk.chunk_id,
          tracking_number: result.tracking_number,
          project_type: result.project_type,
          niche_tags: result.niche_tags,
          stage: result.stage,
          estimated_budget: result.estimated_budget,
          requirements: result.requirements,
          location: result.location,
          bid_deadline: result.bid_deadline,
          confidence: result.confidence,
        });

        const projectMsg: ProjectCreatedMessage = {
          schema_version: '1.0.0',
          trace_id: options.jobId,
          published_at: new Date().toISOString(),
          project_id: `sandbox-${options.jobId}-${chunk.chunk_id}`,
          tracking_number: result.tracking_number,
          county_id: options.profile.geography[0] ?? 'sandbox',
          niche_tags: result.niche_tags,
          stage: result.stage,
          document_id: `sandbox-doc-${options.jobId}`,
          chunk_ids: [chunk.chunk_id],
        };

        const relevance = await scoreProjectRelevance(options.profile, projectMsg);
        relevances.push({
          chunk_id: chunk.chunk_id,
          relevance_score: relevance.relevance_score,
          match_percent: Math.round(relevance.relevance_score * 100),
          rationale: relevance.rationale,
        });
      }
    }

    trace.steps.classifier_filter = filterResults;
    trace.steps.classifier_extraction = extractions;
    trace.steps.relevance = relevances;
    trace.status = 'complete';
  } catch (error) {
    trace.status = 'error';
    trace.error = error instanceof Error ? error.message : String(error);
  }

  traceCache.set(options.jobId, trace);
  return trace;
}
