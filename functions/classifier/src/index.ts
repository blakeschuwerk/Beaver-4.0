import express from 'express';
import { extractedChunksSchema, gcsToExtractedChunksMessage, parseGcsNotification } from '@beaver/shared';
import { randomUUID } from 'node:crypto';
import { runClassifier } from './classifier.js';

const PORT = Number(process.env.PORT ?? 8080);
const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'beaver-classifier' });
});

function parseMessage(body: Record<string, unknown>): Record<string, unknown> {
  const msg = body.message as Record<string, unknown> | undefined;
  if (msg?.data) {
    const decoded = Buffer.from(String(msg.data), 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded) as Record<string, unknown>;

    const gcs = parseGcsNotification(parsed);
    if (gcs) {
      const transformed = gcsToExtractedChunksMessage(gcs, randomUUID());
      if (transformed) return transformed;
    }
    return parsed;
  }
  return body;
}

app.post('/', async (req, res) => {
  try {
    const message = extractedChunksSchema.parse(parseMessage(req.body));

    const result = await runClassifier({
      gcs_uri: String(message.gcs_uri),
      document_id: String(message.document_id),
      county_id: String(message.county_id),
      trace_id: message.trace_id ? String(message.trace_id) : undefined,
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('Classifier error:', error);
    res.status(500).json({ error: String(error) });
  }
});

app.listen(PORT, () => {
  console.log(`beaver-classifier listening on :${PORT}`);
});
