import { useNavigate } from 'react-router-dom';
import type { Project } from '../types';
import { StageBadge, MatchBadge } from './Badges';
import { IconBookmark } from './Icons';
import { formatBudget } from '../lib/utils';
import './ProjectCard.css';

interface ProjectCardProps {
  project: Project;
  tracked?: boolean;
  onToggleTrack?: (id: string) => void;
  detailed?: boolean;
}

export function ProjectCard({ project, tracked, onToggleTrack, detailed }: ProjectCardProps) {
  const navigate = useNavigate();

  return (
    <article
      className="project-card"
      onClick={() => navigate(`/projects/${project.id}`)}
    >
      <div className="project-card__header">
        <div>
          <div className="project-card__name">{project.name}</div>
          <div className="project-card__agency">{project.agency}</div>
        </div>
        <button
          type="button"
          className={`project-card__bookmark${tracked ? ' project-card__bookmark--active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleTrack?.(project.id);
          }}
          aria-label={tracked ? 'Untrack project' : 'Track project'}
        >
          <IconBookmark size={16} />
        </button>
      </div>

      <div className="project-card__badges">
        <StageBadge stage={project.stage} />
        <MatchBadge match={project.match} />
        {project.changed && (
          <span className="project-card__changed">
            <span className="project-card__changed-dot" />
            Changed
          </span>
        )}
      </div>

      <div className="project-card__meta">
        <span className="mono project-card__budget">{formatBudget(project.budget)}</span>
        <div className="project-card__tags">
          {project.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="project-card__tag">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {detailed && project.rationale && (
        <p className="project-card__rationale">{project.rationale}</p>
      )}
    </article>
  );
}
