import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { IconPlay, IconUpload, IconWarning } from '../components/Icons';
import { api } from '../api/client';
import './AdminPage.css';

const EXAMPLE_URLS = [
  {
    label: 'Nash County — Agenda (06/24/2026)',
    url: 'https://nc-nashcounty.civicplus.com/AgendaCenter/ViewFile/Agenda/_06242026-731',
  },
  {
    label: 'Nash County — Agenda (06/15/2026)',
    url: 'https://nc-nashcounty.civicplus.com/AgendaCenter/ViewFile/Agenda/_06152026-728',
  },
  {
    label: 'Nash County — Agenda (06/01/2026)',
    url: 'https://nc-nashcounty.civicplus.com/AgendaCenter/ViewFile/Agenda/_06012026-727',
  },
];

export function AdminInputPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function runTest() {
    if (!user) return;
    setLoading(true);
    try {
      const profile = {
        user_id: user.user_id,
        company: user.company,
        service_categories: user.service_categories,
        geography: user.geography,
        role: user.role,
      };
      const { job_id } = await api.runPipelineTest({ url: url || undefined, profile }, pdf ?? undefined);
      navigate(`/admin/trace/${job_id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-banner">
        <IconWarning size={18} />
        <span>Sandbox mode — nothing is saved to BigQuery or production data stores.</span>
        <div className="admin-banner__actions">
          <Link to="/admin/runs" className="admin-new-test">Run history</Link>
        </div>
      </div>

      <div className="admin-card">
        <label>
          Document URL
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/sample.pdf"
          />
        </label>

        <div className="admin-examples">
          <span className="admin-examples__label">Try an example:</span>
          {EXAMPLE_URLS.map((ex) => (
            <button
              key={ex.url}
              type="button"
              className="admin-example-link"
              onClick={() => setUrl(ex.url)}
            >
              {ex.label}
            </button>
          ))}
        </div>

        <div className="admin-divider"><span>or</span></div>

        <label className="admin-upload">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
            hidden
          />
          <IconUpload size={24} />
          <div>{pdf ? pdf.name : 'Upload a sample PDF'}</div>
          <span>PDF up to 25 MB</span>
        </label>

        <hr className="admin-hr" />

        <div className="admin-profile">
          <div className="admin-profile__label">Test user profile</div>
          <div className="admin-profile__chips">
            {user?.service_categories.map((c) => (
              <span key={c} className="admin-chip admin-chip--accent">{c}</span>
            ))}
          </div>
          <div className="admin-profile__chips">
            {user?.geography.map((g) => (
              <span key={g} className="admin-chip">{g}</span>
            ))}
          </div>
        </div>

        <button type="button" className="admin-run" onClick={runTest} disabled={loading || (!url && !pdf)}>
          <IconPlay size={16} />
          {loading ? 'Running…' : 'Run Test'}
        </button>
      </div>
    </div>
  );
}
