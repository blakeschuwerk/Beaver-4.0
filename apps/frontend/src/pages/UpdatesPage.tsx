import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StageChangeGraphic } from '../components/Badges';
import { api } from '../api/client';
import type { StageUpdate } from '../types';
import './UpdatesPage.css';

export function UpdatesPage() {
  const [updates, setUpdates] = useState<StageUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getUpdates()
      .then(({ updates: data }) => setUpdates(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="results-count">Loading…</p>;

  if (updates.length === 0) {
    return (
      <div className="empty-state">
        <h3>No updates yet</h3>
        <p>Stage changes on your tracked projects will appear here.</p>
      </div>
    );
  }

  return (
    <div className="timeline">
      {updates.map((u) => (
        <div key={`${u.project_id}-${u.changed_at}`} className="timeline__item">
          <div className="timeline__track">
            <span className="timeline__dot" />
            <span className="timeline__line" />
          </div>
          <Link to={`/projects/${u.project_id}`} className="timeline__card">
            <div className="timeline__head">
              <span className="timeline__name">{u.name}</span>
              <span className="timeline__time mono">{u.ago}</span>
            </div>
            <StageChangeGraphic fromStage={u.from_stage} toStage={u.to_stage} />
          </Link>
        </div>
      ))}
    </div>
  );
}
