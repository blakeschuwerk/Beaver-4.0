import { randomUUID } from 'node:crypto';
import {
  BQ_DATASET,
  BQ_TABLE_SCRAPE_ROSTER,
  FS_COUNTIES_COLLECTION,
  TOPIC_SCRAPE_JOBS,
  type CountyConfig,
  type ScrapeRosterRow,
  scrapeJobSchema,
  createBaseMessage,
  createJobId,
} from '@beaver/shared';
import { Firestore } from '@google-cloud/firestore';
import { BigQuery } from '@google-cloud/bigquery';
import { PubSub } from '@google-cloud/pubsub';

const MOCK_MODE = process.env.MOCK_MODE === 'true';

export interface DispatcherDeps {
  firestore: Firestore;
  bigquery: BigQuery;
  pubsub: PubSub;
}

export function createDispatcherDeps(): DispatcherDeps {
  return {
    firestore: new Firestore(),
    bigquery: new BigQuery(),
    pubsub: new PubSub(),
  };
}

/** Check if county is in circuit-breaker cooldown */
export function isCountyBroken(county: CountyConfig): boolean {
  if (!county.broken) return false;
  if (!county.broken_until) return county.broken;
  return new Date(county.broken_until) > new Date();
}

export async function loadCounties(deps: DispatcherDeps): Promise<CountyConfig[]> {
  if (MOCK_MODE) {
    return [
      {
        county_id: 'demo-county',
        name: 'Demo County',
        state: 'CA',
        source_urls: ['https://example.gov/agendas'],
        scraper_strategy: 'crawl4ai',
        broken: false,
        failure_count: 0,
      },
    ];
  }

  const snapshot = await deps.firestore.collection(FS_COUNTIES_COLLECTION).get();
  return snapshot.docs.map((doc) => doc.data() as CountyConfig);
}

export async function loadScrapeRoster(deps: DispatcherDeps): Promise<ScrapeRosterRow[]> {
  if (MOCK_MODE) {
    return [
      {
        county_id: 'demo-county',
        priority: 1,
        status: 'queued',
      },
    ];
  }

  const query = `
    SELECT county_id, priority, last_scraped_at, next_scrape_at, status
    FROM \`${process.env.GCP_PROJECT_ID}.${BQ_DATASET}.${BQ_TABLE_SCRAPE_ROSTER}\`
    WHERE status = 'queued'
    ORDER BY priority ASC
    LIMIT 100
  `;
  const [rows] = await deps.bigquery.query({ query });
  return rows as ScrapeRosterRow[];
}

export async function publishScrapeJob(
  deps: DispatcherDeps,
  county: CountyConfig,
  traceId: string,
): Promise<string> {
  const jobId = createJobId(county.county_id);
  const message = scrapeJobSchema.parse({
    ...createBaseMessage(traceId),
    job_id: jobId,
    county_id: county.county_id,
    scraper_strategy: county.scraper_strategy,
    source_urls: county.source_urls,
    platform: county.platform,
  });

  if (MOCK_MODE) {
    console.log('[MOCK] Published scrape job:', JSON.stringify(message));
    return jobId;
  }

  const dataBuffer = Buffer.from(JSON.stringify(message));
  await deps.pubsub.topic(TOPIC_SCRAPE_JOBS).publishMessage({ data: dataBuffer });
  return jobId;
}

export interface DispatchResult {
  trace_id: string;
  published: string[];
  skipped: string[];
}

export async function runDispatcher(deps: DispatcherDeps, traceId?: string): Promise<DispatchResult> {
  const trace = traceId ?? randomUUID();
  const counties = await loadCounties(deps);
  const roster = await loadScrapeRoster(deps);

  const rosterCountyIds = new Set(roster.map((r) => r.county_id));
  const published: string[] = [];
  const skipped: string[] = [];

  for (const county of counties) {
    if (!rosterCountyIds.has(county.county_id)) {
      skipped.push(county.county_id);
      continue;
    }

    if (isCountyBroken(county)) {
      console.warn(`Skipping broken county: ${county.county_id}`);
      skipped.push(county.county_id);
      continue;
    }

    const jobId = await publishScrapeJob(deps, county, trace);
    published.push(jobId);
  }

  return { trace_id: trace, published, skipped };
}
