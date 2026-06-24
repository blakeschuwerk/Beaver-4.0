import { Link, useNavigate } from 'react-router-dom';
import { ProjectCard } from '../components/ProjectCard';
import { StageChangeGraphic } from '../components/Badges';
import { useProjects, useTrackedIds } from '../hooks/useProjects';
import { api } from '../api/client';
import { useEffect, useState } from 'react';
import type { Project } from '../types';
import './DashboardPage.css';

export function DashboardPage() {
  const navigate = useNavigate();
  const { projects, loading } = useProjects();
  const { trackedIds, toggleTrack } = useTrackedIds();
  const [changed, setChanged] = useState<Project[]>([]);

  useEffect(() => {
    api.getTracks().then(({ projects: tracked }) => {
      setChanged(tracked.filter((p) => p.changed));
    });
  }, []);

  const topMatches = projects.slice(0, 6);

  return (
    <div>
      <section className="section-block">
        <div className="section-header">
          <div>
            <span className="section-header__title">New Matches</span>
            <span className="section-header__count">{topMatches.length}</span>
          </div>
          <button type="button" className="section-header__link" onClick={() => navigate('/feed')}>
            View all →
          </button>
        </div>
        {loading ? (
          <p className="results-count">Loading…</p>
        ) : (
          <div className="project-grid">
            {topMatches.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                tracked={trackedIds.has(p.id)}
                onToggleTrack={toggleTrack}
              />
            ))}
          </div>
        )}
      </section>

      <section className="section-block">
        <div className="section-header">
          <div>
            <span className="section-header__title">Tracked Project Updates</span>
            <span className="section-header__count">{changed.length} changed</span>
          </div>
        </div>
        <div className="update-list">
          {changed.length === 0 ? (
            <p className="results-count">No stage changes on tracked projects.</p>
          ) : (
            changed.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="update-row">
                <span className="update-row__dot" />
                <div>
                  <div className="update-row__name">{p.name}</div>
                  {p.from && p.to && <StageChangeGraphic fromStage={p.from} toStage={p.to} />}
                </div>
                <span className="update-row__time">{p.ago}</span>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
