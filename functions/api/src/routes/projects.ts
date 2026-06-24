import { Router } from 'express';
import type { AuthenticatedRequest } from '../auth.js';
import { listProjects, getProjectById } from '../bq.js';
import { getProfile, listTracks } from '../firestore.js';
import { mapProject, mapProjects } from '../mappers.js';
import { MOCK_RATIONALES, MOCK_STAGE_UPDATES } from '../mock/fixtures.js';

export const projectsRouter = Router();

projectsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const profile = req.profile ?? (await getProfile(userId));
    if (profile) req.profile = profile;

    const filters = {
      userId,
      stage: typeof req.query.stage === 'string' ? req.query.stage : undefined,
      county: typeof req.query.county === 'string' ? req.query.county : undefined,
      tag: typeof req.query.tag === 'string' ? req.query.tag : undefined,
      minMatch: req.query.minMatch ? Number(req.query.minMatch) : undefined,
      query: typeof req.query.query === 'string' ? req.query.query : undefined,
    };

    const rows = await listProjects(filters);
    const tracks = await listTracks(userId);
    const trackMap = new Map(tracks.map((t) => [t.project_id, t]));

    const projects = mapProjects(rows).map((p) => {
      const track = trackMap.get(p.id);
      const update = MOCK_STAGE_UPDATES.find((u) => u.project_id === p.id);
      const changed =
        !!track?.last_viewed_stage && track.last_viewed_stage !== p.stage;
      return mapProject(
        rows.find((r) => r.project_id === p.id)!,
        {
          rationale: MOCK_RATIONALES[p.id],
          changed,
          fromStage: update?.from_stage,
          toStage: update?.to_stage,
          changedAt: update?.changed_at,
        },
      );
    });

    res.json({ projects, total: projects.length });
  } catch (error) {
    console.error('GET /api/projects error:', error);
    res.status(500).json({ error: String(error) });
  }
});

projectsRouter.get('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const projectId = String(req.params.id);
    const row = await getProjectById(projectId, userId);
    if (!row) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json({
      project: mapProject(row, { rationale: MOCK_RATIONALES[row.project_id] }),
    });
  } catch (error) {
    console.error('GET /api/projects/:id error:', error);
    res.status(500).json({ error: String(error) });
  }
});
