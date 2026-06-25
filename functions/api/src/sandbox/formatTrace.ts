import type { PipelineTrace } from './pipeline.js';

const EXTRACTION_METHOD_LABEL: Record<string, string> = {
  docling: 'Extraction (Docling)',
  'mock-text': 'Extraction (mock text — Docling unavailable)',
  'approximate-html': 'Extraction (approximate — non-PDF)',
};

function section(title: string, lines: string[]): string {
  return [`=== ${title} ===`, ...lines, ''].join('\n');
}

function chunkTextById(trace: PipelineTrace, chunkId: string): string | undefined {
  return trace.steps.extraction.chunks.find((c) => c.chunk_id === chunkId)?.text;
}

export function formatPipelineTraceAsText(trace: PipelineTrace): string {
  const lines: string[] = [
    'Beaver Pipeline Trace (sandbox — nothing saved to production)',
    `Job ID: ${trace.job_id}`,
    `Status: ${trace.status}`,
  ];

  if (trace.error) {
    lines.push(`Error: ${trace.error}`);
  }

  lines.push('');

  const { scraper, extraction, classifier_filter, classifier_extraction, relevance } = trace.steps;

  lines.push(
    section('Step 1: Scraper', [
      `Documents discovered: ${scraper.documents_discovered}`,
      `Doc type: ${scraper.doc_type}`,
      `Circuit breaker: ${scraper.circuit_breaker}`,
      `Duration: ${scraper.duration_ms}ms`,
    ]),
  );

  lines.push(
    section(`Step 2: ${EXTRACTION_METHOD_LABEL[extraction.method] ?? 'Extraction'}`, [
      `Parent chunks: ${extraction.parent_chunks}`,
      `Child chunks: ${extraction.child_chunks}`,
      `Classified: ${extraction.chunks_classified} of ${extraction.chunks_total}`,
      `Duration: ${extraction.duration_ms}ms`,
      '',
      'Text preview:',
      extraction.text_preview || '(empty)',
    ]),
  );

  if (extraction.chunks.length > 0) {
    lines.push('Child chunk texts:');
    for (const chunk of extraction.chunks) {
      lines.push(`--- ${chunk.chunk_id} ---`);
      lines.push(chunk.text);
      lines.push('');
    }
  }

  const filterLines = classifier_filter.flatMap((c) => {
    const fullText = chunkTextById(trace, c.chunk_id);
    return [
      `Chunk: ${c.chunk_id}`,
      `Result: ${c.is_project ? 'is_project ✓' : 'skipped'}`,
      `Duration: ${c.duration_ms}ms`,
      `Preview: ${c.text_preview}`,
      ...(fullText && fullText !== c.text_preview ? [`Full text:\n${fullText}`] : []),
      '',
    ];
  });

  lines.push(
    section(
      `Step 3: Classifier / filter (${classifier_filter.filter((c) => c.is_project).length} passed)`,
      filterLines.length > 0 ? filterLines : ['(no chunks classified)'],
    ),
  );

  if (classifier_extraction.length > 0) {
    const extractionLines = classifier_extraction.flatMap((extraction, idx) => [
      `--- Project ${idx + 1} (${extraction.chunk_id}) ---`,
      ...Object.entries(extraction)
        .filter(([key]) => key !== 'chunk_id')
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
      '',
    ]);
    lines.push(section('Step 4: Classifier / extraction', extractionLines));
  } else {
    lines.push(section('Step 4: Classifier / extraction', ['No project chunks passed the filter.']));
  }

  if (relevance.length > 0) {
    const relevanceLines = relevance.flatMap((r, idx) => [
      `--- Project ${idx + 1} (${r.chunk_id}) ---`,
      `Match: ${r.match_percent}% (raw score ${r.relevance_score})`,
      `Duration: ${r.duration_ms}ms`,
      'Rationale:',
      r.rationale ?? '(none)',
      '',
    ]);
    lines.push(section('Step 5: Relevance scoring', relevanceLines));
  } else {
    lines.push(section('Step 5: Relevance scoring', ['No relevance score — no project extracted.']));
  }

  return lines.join('\n').trimEnd() + '\n';
}
