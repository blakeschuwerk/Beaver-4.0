import express from 'express';
import { dispatcherTickSchema } from '@beaver/shared';
import { createDispatcherDeps, runDispatcher } from './dispatcher.js';

const PORT = Number(process.env.PORT ?? 8080);
const app = express();
app.use(express.json());

/** Health check */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'beaver-dispatcher' });
});

/**
 * Pub/Sub push endpoint — triggered by dispatcher-tick topic (Cloud Scheduler).
 * Also accepts manual POST for local dev.
 */
app.post('/', async (req, res) => {
  try {
    const envelope = req.body;
    let traceId: string | undefined;

    if (envelope?.message?.data) {
      const decoded = Buffer.from(envelope.message.data, 'base64').toString('utf-8');
      const tick = dispatcherTickSchema.parse(JSON.parse(decoded));
      traceId = tick.trace_id;
      console.log(`Dispatcher tick received: ${tick.tick_id}`);
    }

    const deps = createDispatcherDeps();
    const result = await runDispatcher(deps, traceId);
    console.log('Dispatch result:', result);
    res.status(200).json(result);
  } catch (error) {
    console.error('Dispatcher error:', error);
    res.status(500).json({ error: String(error) });
  }
});

app.listen(PORT, () => {
  console.log(`beaver-dispatcher listening on :${PORT} (MOCK_MODE=${process.env.MOCK_MODE ?? 'false'})`);
});
