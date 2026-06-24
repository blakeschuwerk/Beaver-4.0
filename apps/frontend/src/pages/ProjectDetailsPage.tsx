import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Project } from '../types';
import { StageBadge, MatchBadge } from '../components/Badges';
import { IconArrowLeft, IconBookmark, IconStar } from '../components/Icons';
import { formatBudget, stageLabel } from '../lib/utils';
import { PROJECT_STAGES } from '../lib/stages';
import { useTrackedIds } from '../hooks/useProjects';
import './ProjectDetailsPage.css';

export function ProjectDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { trackedIds, toggleTrack } = useTrackedIds();
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getProject(id).then(({ project: p }) => setProject(p)).catch(console.error);
  }, [id]);

  if (!project) return <p className="results-count">Loading…</p>;

  const tracked = trackedIds.has(project.id);
  const stageIndex = PROJECT_STAGES.indexOf(project.stage as (typeof PROJECT_STAGES)[number]);

  return (
    <div className="details-page">
      <button type="button" className="details-back" onClick={() => navigate(-1)}>
        <IconArrowLeft size={16} />
        Back
      </button>

      <div className="details-header">
        <div>
          <div className="details-header__badges">
            <StageBadge stage={project.stage} />
            <MatchBadge match={project.match} />
          </div>
          <h1 className="details-header__title">{project.name}</h1>
          <p className="details-header__sub">{project.agency} · {project.location}</p>
        </div>
        <button
          type="button"
          className={`details-track${tracked ? ' details-track--active' : ''}`}
          onClick={() => toggleTrack(project.id)}
        >
          <IconBookmark size={16} />
          {tracked ? 'Tracking' : 'Track this project'}
        </button>
      </div>

      <div className="details-stage-card">
        <div className="details-stage-card__label">Pipeline stage</div>
        <div className="stage-tracker">
          {PROJECT_STAGES.map((stage, i) => {
            const completed = i < stageIndex;
            const current = i === stageIndex;
            return (
              <div key={stage} className="stage-tracker__step-wrap">
                {i > 0 && (
                  <div className={`stage-tracker__connector${completed ? ' stage-tracker__connector--done' : ''}`} />
                )}
                <div className="stage-tracker__step">
                  <div
                    className={`stage-tracker__circle${
                      current ? ' stage-tracker__circle--current' : completed ? ' stage-tracker__circle--done' : ''
                    }`}
                  >
                    {i + 1}
                  </div>
                  <span
                    className={`stage-tracker__label${
                      current ? ' stage-tracker__label--current' : completed ? ' stage-tracker__label--past' : ''
                    }`}
                  >
                    {stageLabel(stage)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="details-grid">
        <div className="details-main">
          <div className="details-card">
            <div className="details-card__label">Requirements</div>
            <p>{project.requirements || 'No requirements extracted yet.'}</p>
          </div>

          <div className="details-match-card">
            <div className="details-match-card__head">
              <IconStar size={16} />
              <span>WHY THIS MATCHED YOU</span>
            </div>
            <p>{project.rationale}</p>
          </div>

          <div className="details-card">
            <div className="details-card__label">Trade tags</div>
            <div className="details-tags">
              {project.tags.map((tag) => (
                <span key={tag} className="details-tag">{tag}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="details-card details-meta">
          {[
            ['Budget', formatBudget(project.budget)],
            ['Stage', <StageBadge key="stage" stage={project.stage} />],
            ['Deadline', project.deadline],
            ['County', project.county],
            ['Tracking #', project.tracking],
            ['Type', project.type],
          ].map(([label, value]) => (
            <div key={String(label)} className="details-meta__row">
              <span>{label}</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
