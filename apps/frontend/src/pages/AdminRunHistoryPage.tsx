import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconWarning } from '../components/Icons';
import { api } from '../api/client';
import type { SandboxRunSummary } from '../types';
import './AdminPage.css';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

function truncateSource(source: string, max = 60): string {
  if (source.length <= max) return source;
  return source.slice(0, max - 3) + '...';
}

export function AdminRunHistoryPage() {
  const [runs, setRuns] = useState<SandboxRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getSandboxRuns()
      .then(({ runs: data }) => {
        if (!cancelled) setRuns(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load runs');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="admin-page">
      <div className="admin-banner admin-banner--compact">
        <IconWarning size={16} />
        <span>Local sandbox run history — file-based, not BigQuery</span>
        <div className="admin-banner__actions">
          <Link to="/admin" className="admin-new-test">New test</Link>
        </div>
      </div>

      {loading && <p className="results-count">Loading run history…</p>}
      {error && <p className="admin-error">{error}</p>}

      {!loading && !error && runs.length === 0 && (
        <p className="results-count">No sandbox runs recorded yet.</p>
      )}

      {!loading && !error && runs.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Doc source</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Projects</th>
              <th>Top relevance</th>
              <th>Trace</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.job_id}>
                <td className="mono">{formatTimestamp(run.timestamp)}</td>
                <td title={run.doc_source}>{truncateSource(run.doc_source)}</td>
                <td>{run.status}</td>
                <td><span className="admin-step__badge">{run.total_duration_ms}ms</span></td>
                <td>{run.projects_count}</td>
                <td>{run.top_relevance_score > 0 ? `${Math.round(run.top_relevance_score * 100)}%` : '—'}</td>
                <td>
                  {run.trace_available ? (
                    <Link to={`/admin/trace/${run.job_id}`}>View trace</Link>
                  ) : (
                    <span className="admin-skip">trace expired</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
