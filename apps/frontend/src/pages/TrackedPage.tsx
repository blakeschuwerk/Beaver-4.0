import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProjectCard } from '../components/ProjectCard';
import { api } from '../api/client';
import type { Project } from '../types';
import { useTrackedIds } from '../hooks/useProjects';

export function TrackedPage() {
  const navigate = useNavigate();
  const { toggleTrack } = useTrackedIds();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getTracks()
      .then(({ projects: data }) => setProjects(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="results-count">Loading…</p>;

  if (projects.length === 0) {
    return (
      <div className="empty-state">
        <h3>No tracked projects yet</h3>
        <p>Bookmark projects from the Lead Feed to follow their progress.</p>
        <button type="button" onClick={() => navigate('/feed')}>
          Browse Lead Feed
        </button>
      </div>
    );
  }

  return (
    <div className="project-grid">
      {projects.map((p) => (
        <ProjectCard
          key={p.id}
          project={p}
          tracked
          onToggleTrack={toggleTrack}
        />
      ))}
    </div>
  );
}
