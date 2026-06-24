import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { IconChevronDown, IconWarning } from '../components/Icons';
import { api } from '../api/client';
import type { PipelineTrace } from '../types';
import './AdminPage.css';

export function AdminTracePage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [trace, setTrace] = useState<PipelineTrace | null>(null);
  const [openSteps, setOpenSteps] = useState<Record<number, boolean>>({ 1: true, 2: true, 3: true, 4: true, 5: true });

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    async function poll() {
      try {
        const { trace: data } = await api.getPipelineTrace(jobId!);
        if (!cancelled) {
          setTrace(data);
          if (data.status === 'running') {
            setTimeout(poll, 1500);
          }
        }
      } catch {
        if (!cancelled) setTimeout(poll, 2000);
      }
    }

    poll();
    return () => { cancelled = true; };
  }, [jobId]);

  function toggleStep(n: number) {
    setOpenSteps((prev) => ({ ...prev, [n]: !prev[n] }));
  }

  if (!trace) return <p className="results-count">Loading trace…</p>;

  const steps = [
    {
      n: 1,
      title: 'Scraper',
      subtitle: 'Document discovery',
      badge: `${trace.steps.scraper.documents_discovered} docs`,
      content: (
        <div className="admin-metrics">
          <div className="admin-metric"><span>Documents</span><strong>{trace.steps.scraper.documents_discovered}</strong></div>
          <div className="admin-metric"><span>Doc type</span><strong>{trace.steps.scraper.doc_type}</strong></div>
          <div className="admin-metric"><span>Circuit breaker</span><strong>{trace.steps.scraper.circuit_breaker}</strong></div>
        </div>
      ),
    },
    {
      n: 2,
      title: 'Extraction (Docling)',
      subtitle: 'Text extraction + chunking',
      badge: `${trace.steps.extraction.child_chunks} chunks`,
      content: (
        <>
          <div className="admin-metrics">
            <div className="admin-metric"><span>Parent chunks</span><strong>{trace.steps.extraction.parent_chunks}</strong></div>
            <div className="admin-metric"><span>Child chunks</span><strong>{trace.steps.extraction.child_chunks}</strong></div>
          </div>
          <pre className="admin-preview mono">{trace.steps.extraction.text_preview}</pre>
        </>
      ),
    },
    {
      n: 3,
      title: 'Classifier / filter',
      subtitle: 'is_project per chunk',
      badge: `${trace.steps.classifier_filter.filter((c) => c.is_project).length} passed`,
      content: (
        <table className="admin-table">
          <thead><tr><th>Chunk</th><th>Preview</th><th>Result</th></tr></thead>
          <tbody>
            {trace.steps.classifier_filter.map((c) => (
              <tr key={c.chunk_id}>
                <td className="mono">{c.chunk_id}</td>
                <td>{c.text_preview}</td>
                <td><span className={c.is_project ? 'admin-pass' : 'admin-skip'}>{c.is_project ? 'is_project ✓' : 'skipped'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
    {
      n: 4,
      title: 'Classifier / extraction',
      subtitle: 'Structured project fields',
      badge: trace.steps.classifier_extraction ? 'extracted' : 'none',
      content: trace.steps.classifier_extraction ? (
        <pre className="admin-code">
          {Object.entries(trace.steps.classifier_extraction).map(([k, v]) => (
            <div key={k}><span className="admin-code__key">{k}</span>: <span className="admin-code__val">{JSON.stringify(v)}</span></div>
          ))}
        </pre>
      ) : <p>No project chunks passed the filter.</p>,
    },
    {
      n: 5,
      title: 'Relevance scoring',
      subtitle: 'Match against test profile',
      badge: trace.steps.relevance ? `${trace.steps.relevance.match_percent}%` : '—',
      content: trace.steps.relevance ? (
        <>
          <div className="admin-score-bar">
            <div style={{ width: `${trace.steps.relevance.match_percent}%` }} />
          </div>
          <div className="admin-score-value mono">{trace.steps.relevance.match_percent}%</div>
          <div className="admin-rationale">{trace.steps.relevance.rationale}</div>
        </>
      ) : <p>No relevance score — no project extracted.</p>,
    },
  ];

  return (
    <div className="admin-page admin-trace">
      <div className="admin-banner admin-banner--compact">
        <IconWarning size={16} />
        <span>Sandbox trace · {trace.status}</span>
        <Link to="/admin" className="admin-new-test">New test</Link>
      </div>

      {trace.error && <p className="admin-error">{trace.error}</p>}

      {steps.map((step) => (
        <div key={step.n} className="admin-step">
          <button type="button" className="admin-step__head" onClick={() => toggleStep(step.n)}>
            <span className="admin-step__num mono">{step.n}</span>
            <div className="admin-step__titles">
              <strong>{step.title}</strong>
              <span>{step.subtitle}</span>
            </div>
            <span className="admin-step__badge">{step.badge}</span>
            <IconChevronDown size={18} style={{ transform: openSteps[step.n] ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }} />
          </button>
          {openSteps[step.n] && <div className="admin-step__body">{step.content}</div>}
        </div>
      ))}
    </div>
  );
}
