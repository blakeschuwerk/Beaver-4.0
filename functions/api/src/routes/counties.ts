import { Router } from 'express';
import type { AuthenticatedRequest } from '../auth.js';
import { listCounties } from '../firestore.js';

export const countiesRouter = Router();

countiesRouter.get('/', async (_req: AuthenticatedRequest, res) => {
  try {
    const counties = await listCounties();
    res.json({ counties });
  } catch (error) {
    console.error('GET /api/counties error:', error);
    res.status(500).json({ error: String(error) });
  }
});
