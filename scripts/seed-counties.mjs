#!/usr/bin/env node
/**
 * Seed counties from config/counties.json into Firestore + scrape_roster.
 * Usage: GCP_PROJECT_ID=beaver4 pnpm seed:counties
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '../functions/dispatcher/package.json'));
const { Firestore } = require('@google-cloud/firestore');
const { BigQuery } = require('@google-cloud/bigquery');

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'beaver4';
const FIRESTORE_DB = process.env.FIRESTORE_DATABASE ?? 'beaver-firebase';
const BQ_DATASET = process.env.BQ_DATASET ?? 'beaver_pipeline';

const configPath = join(dirname(fileURLToPath(import.meta.url)), '../config/counties.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));

async function seedCounty(db, bigquery, county) {
  const doc = {
    county_id: county.county_id,
    name: county.name,
    state: county.state,
    source_urls: county.source_urls,
    scraper_strategy: county.scraper_strategy,
    platform: county.platform ?? null,
    timezone: county.timezone ?? null,
    broken: false,
    failure_count: 0,
    updated_at: new Date().toISOString(),
    notes: county.notes ?? null,
  };

  await db.collection('counties').doc(county.county_id).set(doc, { merge: true });
  console.log(`Firestore: seeded counties/${county.county_id}`);

  const query = `
    MERGE \`${PROJECT_ID}.${BQ_DATASET}.scrape_roster\` T
    USING (SELECT @county_id AS county_id) S
    ON T.county_id = S.county_id
    WHEN MATCHED THEN UPDATE SET priority = @priority, status = 'queued'
    WHEN NOT MATCHED THEN INSERT (county_id, priority, status)
    VALUES (@county_id, @priority, 'queued')
  `;
  await bigquery.query({
    query,
    params: { county_id: county.county_id, priority: county.priority ?? 1 },
  });
  console.log(`BigQuery: seeded scrape_roster for ${county.county_id}`);
}

async function main() {
  const db = new Firestore({ projectId: PROJECT_ID, databaseId: FIRESTORE_DB });
  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  for (const county of config.counties) {
    await seedCounty(db, bigquery, county);
  }
  console.log(`Seeded ${config.counties.length} counties.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
