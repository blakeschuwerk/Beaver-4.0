import { Router } from 'express';
import { z } from 'zod';
import { isValidUSCounty } from '@beaver/shared/us-counties';
import type { AuthenticatedRequest } from '../auth.js';
import { createProfile, getProfile, updateProfile } from '../firestore.js';

const usCountyLabel = z
  .string()
  .refine((value) => isValidUSCounty(value), { message: 'Invalid US county label' });

const createProfileSchema = z.object({
  company: z.string().min(1),
  service_categories: z.array(z.string()).min(1),
  geography: z.array(usCountyLabel).min(1),
});

const patchProfileSchema = z.object({
  company: z.string().min(1).optional(),
  service_categories: z.array(z.string()).optional(),
  geography: z.array(usCountyLabel).optional(),
});

export const profileRouter = Router();

profileRouter.use(async (req: AuthenticatedRequest, res, next) => {
  if (req.profile) {
    next();
    return;
  }
  const profile = await getProfile(req.userId!);
  if (profile) req.profile = profile;
  next();
});

profileRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const profile = req.profile ?? (await getProfile(req.userId!));
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.json({ profile });
  } catch (error) {
    console.error('GET /api/profile error:', error);
    res.status(500).json({ error: String(error) });
  }
});

profileRouter.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    const body = createProfileSchema.parse(req.body);
    const existing = await getProfile(req.userId!);
    if (existing) {
      res.status(409).json({ error: 'Profile already exists' });
      return;
    }

    const profile = await createProfile({
      user_id: req.userId!,
      role: 'user',
      ...body,
      updated_at: new Date().toISOString(),
    });
    req.profile = profile;
    res.status(201).json({ profile });
  } catch (error) {
    console.error('POST /api/profile error:', error);
    res.status(400).json({ error: String(error) });
  }
});

profileRouter.patch('/', async (req: AuthenticatedRequest, res) => {
  try {
    const body = patchProfileSchema.parse(req.body);
    const profile = await updateProfile(req.userId!, body);
    req.profile = profile;
    res.json({ profile });
  } catch (error) {
    console.error('PATCH /api/profile error:', error);
    res.status(400).json({ error: String(error) });
  }
});
