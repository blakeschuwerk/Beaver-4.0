#!/usr/bin/env node
/**
 * End-to-end integration test against live GCP (outlet — run after deploy).
 *
 * Uploads a sample PDF to the raw bucket and polls BigQuery for a projects row.
 * Requires: gcloud auth, GCP_PROJECT_ID, bucket names from terraform outputs.
 *
 * Usage:
 *   GCP_PROJECT_ID=beaver4 node scripts/integration-test.mjs
 *   GCP_PROJECT_ID=beaver4 node scripts/integration-test.mjs --skip-upload  (poll only)
 */

import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '../functions/dispatcher/package.json'));
const { Storage } = require('@google-cloud/storage');
const { BigQuery } = require('@google-cloud/bigquery');

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'beaver4';
const BQ_DATASET = process.env.BQ_DATASET ?? 'beaver_pipeline';
const RAW_BUCKET = process.env.GCS_RAW_BUCKET ?? `beaver-raw-documents-${PROJECT_ID}`;
const COUNTY_ID = process.env.TEST_COUNTY_ID ?? 'test-county';
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = Number(process.env.INTEGRATION_TIMEOUT_MS ?? 120000);
const SKIP_UPLOAD = process.argv.includes('--skip-upload');

// Minimal valid PDF bytes
const SAMPLE_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF',
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function uploadSamplePdf(storage) {
  const hash16 = randomUUID().replace(/-/g, '').slice(0, 16);
  const documentId = `doc-${COUNTY_ID}-${hash16}`;
  const gcsPath = `${COUNTY_ID}/${documentId}/${documentId}.pdf`;
  const traceId = randomUUID();

  const bucket = storage.bucket(RAW_BUCKET);
  const blob = bucket.file(gcsPath);
  await blob.save(SAMPLE_PDF, {
    contentType: 'application/pdf',
    metadata: {
      metadata: {
        county_id: COUNTY_ID,
        document_id: documentId,
        content_hash: hash16,
        doc_type: 'agenda',
        trace_id: traceId,
      },
    },
  });

  console.log(`Uploaded gs://${RAW_BUCKET}/${gcsPath} (trace_id=${traceId})`);
  return { documentId, traceId };
}

async function pollForProject(bigquery, documentId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  const query = `
    SELECT project_id, tracking_number, county_id
    FROM \`${PROJECT_ID}.${BQ_DATASET}.projects\`
    WHERE @document_id IN UNNEST(source_document_ids)
    ORDER BY last_updated_at DESC
    LIMIT 1
  `;

  while (Date.now() < deadline) {
    const [rows] = await bigquery.query({
      query,
      params: { document_id: documentId },
      types: { document_id: 'STRING' },
    });
    if (rows.length > 0) {
      return rows[0];
    }
    console.log(`Waiting for projects row (document_id=${documentId})...`);
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

async function pollForMatch(bigquery, projectId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  const query = `
    SELECT match_id, user_id, relevance_score
    FROM \`${PROJECT_ID}.${BQ_DATASET}.matches\`
    WHERE project_id = @project_id
    LIMIT 1
  `;

  while (Date.now() < deadline) {
    const [rows] = await bigquery.query({
      query,
      params: { project_id: projectId },
      types: { project_id: 'STRING' },
    });
    if (rows.length > 0) {
      return rows[0];
    }
    console.log(`Waiting for matches row (project_id=${projectId})...`);
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

async function main() {
  const storage = new Storage({ projectId: PROJECT_ID });
  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  let documentId = process.env.TEST_DOCUMENT_ID;
  if (!SKIP_UPLOAD) {
    const uploaded = await uploadSamplePdf(storage);
    documentId = uploaded.documentId;
  }

  if (!documentId) {
    console.error('No document_id — upload or set TEST_DOCUMENT_ID');
    process.exit(1);
  }

  const project = await pollForProject(bigquery, documentId);
  if (!project) {
    console.error('Timeout: no projects row found');
    process.exit(1);
  }
  console.log('Project row:', project);

  const match = await pollForMatch(bigquery, project.project_id);
  if (!match) {
    console.error('Timeout: no matches row found (F5 may need user_profiles seeded)');
    process.exit(1);
  }
  console.log('Match row:', match);
  console.log('Integration test passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
