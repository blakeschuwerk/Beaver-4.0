import express from 'express';
import { projectCreatedSchema } from '@beaver/shared';
import { runPersonalization } from './personalization.js';

const PORT = Number(process.env.PORT ?? 8080);
const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'beaver-personalization', mode: 'stub' });
});

app.post('/', async (req, res) => {
  try {
    const envelope = req.body;
    let message;

    if (envelope?.message?.data) {
      const decoded = Buffer.from(envelope.message.data, 'base64').toString('utf-8');
      message = projectCreatedSchema.parse(JSON.parse(decoded));
    } else {
      message = projectCreatedSchema.parse(envelope);
    }

    const result = await runPersonalization(message);
    res.status(200).json(result);
  } catch (error) {
    console.error('Personalization error:', error);
    res.status(500).json({ error: String(error) });
  }
});

app.listen(PORT, () => {
  console.log(`beaver-personalization listening on :${PORT} (stub mode)`);
});
