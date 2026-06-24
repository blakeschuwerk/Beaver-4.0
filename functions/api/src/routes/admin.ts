import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../auth.js';
import { requireAdmin } from '../auth.js';
import { getTrace, runSandboxPipeline } from '../sandbox/pipeline.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const testBodySchema = z.object({
  url: z.string().url().optional(),
  profile: z.object({
    company: z.string(),
    service_categories: z.array(z.string()),
    geography: z.array(z.string()),
  }),
});

export const adminRouter = Router();

adminRouter.use(requireAdmin);

adminRouter.post('/pipeline/test', upload.single('pdf'), async (req: AuthenticatedRequest, res) => {
  try {
    let body: z.infer<typeof testBodySchema>;
    if (req.file) {
      body = testBodySchema.parse({
        url: req.body.url || undefined,
        profile: typeof req.body.profile === 'string' ? JSON.parse(req.body.profile) : req.body.profile,
      });
    } else {
      body = testBodySchema.parse(req.body);
    }

    if (!body.url && !req.file) {
      res.status(400).json({ error: 'Provide url or PDF upload' });
      return;
    }

    const jobId = randomUUID();
    const profile = {
      user_id: req.userId!,
      role: 'admin' as const,
      ...body.profile,
    };

    runSandboxPipeline({
      jobId,
      url: body.url,
      pdfBuffer: req.file?.buffer,
      profile,
    }).catch((err) => console.error('Sandbox pipeline error:', err));

    res.status(202).json({ job_id: jobId, status: 'running' });
  } catch (error) {
    console.error('POST /api/admin/pipeline/test error:', error);
    res.status(400).json({ error: String(error) });
  }
});

adminRouter.get('/pipeline/trace/:jobId', (req: AuthenticatedRequest, res) => {
  const trace = getTrace(String(req.params.jobId));
  if (!trace) {
    res.status(404).json({ error: 'Trace not found' });
    return;
  }
  res.json({ trace });
});
