import { Router } from 'express';
import type { AuthenticatedRequest } from '../auth.js';
import { listTracks, addTrack, removeTrack } from '../firestore.js';
import { getProjectById } from '../bq.js';
import { mapProject } from '../mappers.js';
import { MOCK_RATIONALES, MOCK_STAGE_UPDATES } from '../mock/fixtures.js';

export const tracksRouter = Router();

tracksRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const tracks = await listTracks(userId);
    const projects = await Promise.all(
      tracks.map(async (track) => {
        const row = await getProjectById(track.project_id, userId);
        if (!row) return null;
        const update = MOCK_STAGE_UPDATES.find((u) => u.project_id === track.project_id);
        const changed =
          !!track.last_viewed_stage && track.last_viewed_stage !== row.stage;
        return mapProject(row, {
          rationale: MOCK_RATIONALES[row.project_id],
          changed,
          fromStage: update?.from_stage,
          toStage: update?.to_stage,
          changedAt: update?.changed_at,
        });
      }),
    );

    res.json({
      tracks: tracks.map((t) => ({ ...t })),
      projects: projects.filter(Boolean),
    });
  } catch (error) {
    console.error('GET /api/tracks error:', error);
    res.status(500).json({ error: String(error) });
  }
});

tracksRouter.post('/:projectId', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const { projectId } = req.params;
    const id = String(projectId);
    const row = await getProjectById(id, userId);
    if (!row) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const track = await addTrack(userId, id);
    res.status(201).json({ track });
  } catch (error) {
    console.error('POST /api/tracks/:projectId error:', error);
    res.status(500).json({ error: String(error) });
  }
});

tracksRouter.delete('/:projectId', async (req: AuthenticatedRequest, res) => {
  try {
    await removeTrack(req.userId!, String(req.params.projectId));
    res.status(204).send();
  } catch (error) {
    console.error('DELETE /api/tracks/:projectId error:', error);
    res.status(500).json({ error: String(error) });
  }
});
