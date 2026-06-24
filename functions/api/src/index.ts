import express from 'express';
import cors from 'cors';
import { SERVICE_API } from '@beaver/shared';
import { authMiddleware } from './auth.js';
import { projectsRouter } from './routes/projects.js';
import { matchesRouter } from './routes/matches.js';
import { countiesRouter } from './routes/counties.js';
import { profileRouter } from './routes/profile.js';
import { tracksRouter } from './routes/tracks.js';
import { updatesRouter } from './routes/updates.js';
import { adminRouter } from './routes/admin.js';

const PORT = Number(process.env.PORT ?? 8080);
const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE_API });
});

app.use('/api', authMiddleware);
app.use('/api/projects', projectsRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/counties', countiesRouter);
app.use('/api/profile', profileRouter);
app.use('/api/tracks', tracksRouter);
app.use('/api/updates', updatesRouter);
app.use('/api/admin', adminRouter);

app.listen(PORT, () => {
  console.log(`${SERVICE_API} listening on :${PORT} (MOCK_MODE=${process.env.MOCK_MODE ?? 'false'})`);
});
