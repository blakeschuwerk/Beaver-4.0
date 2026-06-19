/**
 * Beaver 4.0 shared constants — topic names, bucket names, dataset names, lifecycle stages.
 * All services MUST reference these constants rather than hardcoding strings.
 */

export const SCHEMA_VERSION = '1.0.0';

/** GCP resource naming */
export const GCP_REGION_DEFAULT = 'us-central1';
export const BQ_DATASET = 'beaver_pipeline';

/** GCS buckets */
export const GCS_RAW_DOCUMENTS_BUCKET = 'beaver-raw-documents';
export const GCS_STAGING_EXTRACTED_BUCKET = 'beaver-staging-extracted';

/** Firestore collections */
export const FS_COUNTIES_COLLECTION = 'counties';
export const FS_USER_PROFILES_COLLECTION = 'user_profiles';

/** BigQuery tables */
export const BQ_TABLE_SCRAPE_ROSTER = 'scrape_roster';
export const BQ_TABLE_PROJECTS = 'projects';
export const BQ_TABLE_PROJECT_CHUNKS = 'project_chunks';
export const BQ_TABLE_MATCHES = 'matches';

/** Pub/Sub topics */
export const TOPIC_DISPATCHER_TICK = 'dispatcher-tick';
export const TOPIC_SCRAPE_JOBS = 'scrape-jobs';
export const TOPIC_RAW_DOCUMENTS = 'raw-documents';
export const TOPIC_EXTRACTED_CHUNKS = 'extracted-chunks';
export const TOPIC_PROJECTS_CREATED = 'projects-created';
export const TOPIC_MATCHES_CREATED = 'matches-created';

/** DLQ suffix — full topic name is `${topic}-dlq` */
export const DLQ_SUFFIX = '-dlq';

/** Cloud Run service names */
export const SERVICE_DISPATCHER = 'beaver-dispatcher';
export const SERVICE_SCRAPER = 'beaver-scraper';
export const SERVICE_ANALYZER = 'beaver-analyzer';
export const SERVICE_CLASSIFIER = 'beaver-classifier';
export const SERVICE_PERSONALIZATION = 'beaver-personalization';

/** Project lifecycle stages (municipal project evolution) */
export const PROJECT_STAGES = [
  'subcommittee',
  'approved',
  'bidding',
  'awarded',
  'closed',
] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number];

/** Document types the scraper targets */
export const DOCUMENT_TYPES = [
  'agenda',
  'packet',
  'minutes',
  'rfp',
  'scope_of_work',
  'tabulation',
  'bid_roster',
  'other',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Scraper routing strategies */
export const SCRAPER_STRATEGIES = [
  'civic_scraper',
  'crawl4ai',
  'custom',
] as const;

export type ScraperStrategy = (typeof SCRAPER_STRATEGIES)[number];

/** Circuit breaker defaults */
export const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
export const CIRCUIT_BREAKER_COOLDOWN_HOURS = 24;

/** Secret Manager secret IDs */
export const SECRET_LLM_ENDPOINT_URL = 'llm-endpoint-url';
export const SECRET_LLM_API_KEY = 'runpod-api-key';
