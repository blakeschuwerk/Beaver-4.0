#!/usr/bin/env node
/**
 * Seed one plumbing-test county in Firestore (beaver-firebase) and scrape_roster in BigQuery.
 * Usage: GCP_PROJECT_ID=beaver4 node scripts/seed.mjs
 */

import { Firestore } from '@google-cloud/firestore';
import { BigQuery } from '@google-cloud/bigquery';

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
