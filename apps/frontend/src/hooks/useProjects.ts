import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Project } from '../types';

export function useTrackedIds() {
  const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const { tracks } = await api.getTracks();
    setTrackedIds(new Set(tracks.map((t) => t.project_id)));
  }, []);

  useEffect(() => {
    refresh().catch(console.error);
  }, [refresh]);

  const toggleTrack = useCallback(
    async (projectId: string) => {
      if (trackedIds.has(projectId)) {
        await api.untrackProject(projectId);
      } else {
        await api.trackProject(projectId);
      }
      await refresh();
    },
    [trackedIds, refresh],
  );

  return { trackedIds, toggleTrack, refresh, trackedCount: trackedIds.size };
}

export function useProjects(filters: Record<string, string | number | undefined> = {}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .getProjects(filters)
      .then(({ projects: data }) => setProjects(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [JSON.stringify(filters)]);

  return { projects, loading };
}
