import { Router } from 'express';
import type { AuthenticatedRequest } from '../auth.js';
import { listMatches } from '../bq.js';
import { mapProjects } from '../mappers.js';
import { MOCK_RATIONALES } from '../mock/fixtures.js';

export const matchesRouter = Router();

matchesRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const rows = await listMatches(userId);
    const matches = mapProjects(rows).map((p) => ({
      ...p,
      rationale: MOCK_RATIONALES[p.id] ?? p.rationale,
    }));
    res.json({ matches, total: matches.length });
  } catch (error) {
    console.error('GET /api/matches error:', error);
    res.status(500).json({ error: String(error) });
  }
});
