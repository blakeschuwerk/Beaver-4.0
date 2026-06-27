import { z } from 'zod';
import { SCHEMA_VERSION } from './constants.js';

/** Base fields present on every Pub/Sub message */
export const baseMessageSchema = z.object({
  schema_version: z.string().default(SCHEMA_VERSION),
  trace_id: z.string().uuid(),
  published_at: z.string().datetime(),
});

export type BaseMessage = z.infer<typeof baseMessageSchema>;

/** Cloud Scheduler → F1 Dispatcher */
export const dispatcherTickSchema = baseMessageSchema.extend({
  tick_id: z.string(),
  scheduled_at: z.string().datetime(),
});

export type DispatcherTickMessage = z.infer<typeof dispatcherTickSchema>;

/** F1 → F2 */
export const scrapeJobSchema = baseMessageSchema.extend({
  job_id: z.string(),
  county_id: z.string(),
  scraper_strategy: z.enum(['civic_scraper', 'crawl4ai', 'custom']),
  source_urls: z.array(z.string().url()),
  platform: z.string().optional(),
  timezone: z.string().optional(),
});

export type ScrapeJobMessage = z.infer<typeof scrapeJobSchema>;

/** GCS notification → F3 (raw documents bucket) */
export const rawDocumentSchema = baseMessageSchema.extend({
  gcs_uri: z.string(),
  document_id: z.string(),
  county_id: z.string(),
  content_hash: z.string(),
  doc_type: z.enum([
    'agenda',
    'packet',
    'minutes',
    'rfp',
    'scope_of_work',
    'tabulation',
    'bid_roster',
    'other',
  ]),
  source_url: z.string().url().optional(),
  meeting_date: z.string().optional(),
});

export type RawDocumentMessage = z.infer<typeof rawDocumentSchema>;

/** GCS notification → F4 (staging extracted bucket) */
export const extractedChunksSchema = baseMessageSchema.extend({
  gcs_uri: z.string(),
  document_id: z.string(),
  county_id: z.string(),
  chunk_count: z.number().int().nonnegative(),
  content_hash: z.string().optional(),
});

export type ExtractedChunksMessage = z.infer<typeof extractedChunksSchema>;

/** F4 → F5 */
export const projectCreatedSchema = baseMessageSchema.extend({
  project_id: z.string(),
  tracking_number: z.string().optional(),
  county_id: z.string(),
  niche_tags: z.array(z.string()),
  stage: z.enum(['subcommittee', 'approved', 'bidding', 'awarded', 'closed']),
  document_id: z.string(),
  chunk_ids: z.array(z.string()),
});

export type ProjectCreatedMessage = z.infer<typeof projectCreatedSchema>;

/** F5 → F6 (stub) */
export const matchCreatedSchema = baseMessageSchema.extend({
  match_id: z.string(),
  user_id: z.string(),
  project_id: z.string(),
  relevance_score: z.number().min(0).max(1),
  county_id: z.string(),
});

export type MatchCreatedMessage = z.infer<typeof matchCreatedSchema>;
