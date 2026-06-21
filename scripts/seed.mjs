#!/usr/bin/env node
/**
 * Seed one plumbing-test county in Firestore (beaver-firebase) and scrape_roster in BigQuery.
 * Usage: pnpm seed   (from repo root, after pnpm install)
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '../functions/dispatcher/package.json'));
const { Firestore } = require('@google-cloud/firestore');
const { BigQuery } = require('@google-cloud/bigquery');

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'beaver4';
const FIRESTORE_DB = process.env.FIRESTORE_DATABASE ?? 'beaver-firebase';
const BQ_DATASET = process.env.BQ_DATASET ?? 'beaver_pipeline';

const COUNTY_ID = 'test-county';
const COUNTY_DOC = {
  county_id: COUNTY_ID,
  name: 'Plumbing Test County',
  state: 'CA',
  source_urls: ['https://example.gov/agendas'],
  scraper_strategy: 'crawl4ai',
  platform: 'test',
  broken: false,
  failure_count: 0,
  updated_at: new Date().toISOString(),
};

async function seedFirestore() {
  const db = new Firestore({ projectId: PROJECT_ID, databaseId: FIRESTORE_DB });
  await db.collection('counties').doc(COUNTY_ID).set(COUNTY_DOC, { merge: true });
  console.log(`Firestore: seeded counties/${COUNTY_ID} in database ${FIRESTORE_DB}`);

  await db.collection('user_profiles').doc('user-plumbing-test').set({
    user_id: 'user-plumbing-test',
    company: 'Plumbing Test Contractors',
    service_categories: ['roadway', 'drainage', 'civil'],
    geography: ['test-county', 'CA'],
  }, { merge: true });
  console.log('Firestore: seeded user_profiles/user-plumbing-test');
}

async function seedBigQuery() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });
  const query = `
    MERGE \`${PROJECT_ID}.${BQ_DATASET}.scrape_roster\` T
    USING (SELECT @county_id AS county_id) S
    ON T.county_id = S.county_id
    WHEN MATCHED THEN UPDATE SET priority = 1, status = 'queued'
    WHEN NOT MATCHED THEN INSERT (county_id, priority, status)
    VALUES (@county_id, 1, 'queued')
  `;
  await bigquery.query({
    query,
    params: { county_id: COUNTY_ID },
  });
  console.log(`BigQuery: seeded scrape_roster row for ${COUNTY_ID}`);
}

async function main() {
  await seedFirestore();
  await seedBigQuery();
  console.log('Seed complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
