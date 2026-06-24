import { Router } from 'express';
import { STAGE_DISPLAY_LABELS } from '@beaver/shared';
import type { AuthenticatedRequest } from '../auth.js';
import { listTracks } from '../firestore.js';
import { getProjectById } from '../bq.js';
import { MOCK_STAGE_UPDATES } from '../mock/fixtures.js';

export const updatesRouter = Router();

updatesRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const tracks = await listTracks(userId);
    const trackedIds = new Set(tracks.map((t) => t.project_id));

    const updates = await Promise.all(
      MOCK_STAGE_UPDATES.filter((u) => trackedIds.has(u.project_id)).map(async (update) => {
        const row = await getProjectById(update.project_id, userId);
        const name = row?.project_type ?? update.project_id;
        const diff = Date.now() - new Date(update.changed_at).getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const ago = days === 0 ? 'Today' : days === 1 ? '1 day ago' : `${days} days ago`;

        return {
          project_id: update.project_id,
          name,
          from_stage: update.from_stage,
          to_stage: update.to_stage,
          from_label: STAGE_DISPLAY_LABELS[update.from_stage],
          to_label: STAGE_DISPLAY_LABELS[update.to_stage],
          changed_at: update.changed_at,
          ago,
        };
      }),
    );

    res.json({ updates: updates.sort((a, b) => b.changed_at.localeCompare(a.changed_at)) });
  } catch (error) {
    console.error('GET /api/updates error:', error);
    res.status(500).json({ error: String(error) });
  }
});
