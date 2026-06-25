import type { PipelineTrace } from '../types';

const EXTRACTION_METHOD_LABEL: Record<string, string> = {
  docling: 'Extraction (Docling)',
  'mock-text': 'Extraction (mock text — Docling unavailable)',
  'approximate-html': 'Extraction (approximate — non-PDF)',
};

/** Mirrors functions/api/src/sandbox/formatTrace.ts for client-side copy without a round trip. */
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

  const section = (title: string, body: string[]) => {
    lines.push(`=== ${title} ===`, ...body, '');
  };

  const { scraper, extraction, classifier_filter, classifier_extraction, relevance } = trace.steps;

  section('Step 1: Scraper', [
    `Documents discovered: ${scraper.documents_discovered}`,
    `Doc type: ${scraper.doc_type}`,
    `Circuit breaker: ${scraper.circuit_breaker}`,
    `Duration: ${scraper.duration_ms}ms`,
  ]);

  section(`Step 2: ${EXTRACTION_METHOD_LABEL[extraction.method] ?? 'Extraction'}`, [
    `Parent chunks: ${extraction.parent_chunks}`,
    `Child chunks: ${extraction.child_chunks}`,
    `Classified: ${extraction.chunks_classified} of ${extraction.chunks_total}`,
    `Duration: ${extraction.duration_ms}ms`,
    '',
    'Text preview:',
    extraction.text_preview || '(empty)',
  ]);

  if (extraction.chunks.length > 0) {
    lines.push('Child chunk texts:');
    for (const chunk of extraction.chunks) {
      lines.push(`--- ${chunk.chunk_id} ---`, chunk.text, '');
    }
  }

  const filterLines = classifier_filter.flatMap((c) => {
    const fullText = extraction.chunks.find((x) => x.chunk_id === c.chunk_id)?.text;
    return [
      `Chunk: ${c.chunk_id}`,
      `Result: ${c.is_project ? 'is_project ✓' : 'skipped'}`,
      `Duration: ${c.duration_ms}ms`,
      `Preview: ${c.text_preview}`,
      ...(fullText && fullText !== c.text_preview ? [`Full text:\n${fullText}`] : []),
      '',
    ];
  });

  section(
    `Step 3: Classifier / filter (${classifier_filter.filter((c) => c.is_project).length} passed)`,
    filterLines.length > 0 ? filterLines : ['(no chunks classified)'],
  );

  if (classifier_extraction.length > 0) {
    section(
      'Step 4: Classifier / extraction',
      classifier_extraction.flatMap((extraction, idx) => [
        `--- Project ${idx + 1} (${extraction.chunk_id}) ---`,
        ...Object.entries(extraction)
          .filter(([key]) => key !== 'chunk_id')
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
        '',
      ]),
    );
  } else {
    section('Step 4: Classifier / extraction', ['No project chunks passed the filter.']);
  }

  if (relevance.length > 0) {
    section(
      'Step 5: Relevance scoring',
      relevance.flatMap((r, idx) => [
        `--- Project ${idx + 1} (${r.chunk_id}) ---`,
        `Match: ${r.match_percent}% (raw score ${r.relevance_score})`,
        `Duration: ${r.duration_ms}ms`,
        'Rationale:',
        r.rationale ?? '(none)',
        '',
      ]),
    );
  } else {
    section('Step 5: Relevance scoring', ['No relevance score — no project extracted.']);
  }

  return lines.join('\n').trimEnd() + '\n';
}
