import { z } from 'zod';
import {
  SCRAPER_STRATEGIES,
  PROJECT_STAGES,
} from './constants.js';

/** Firestore counties collection document */
export const countyConfigSchema = z.object({
  county_id: z.string(),
  name: z.string(),
  state: z.string(),
  source_urls: z.array(z.string().url()),
  scraper_strategy: z.enum(SCRAPER_STRATEGIES as unknown as [string, ...string[]]),
  platform: z.string().optional(),
  broken: z.boolean().default(false),
  failure_count: z.number().int().nonnegative().default(0),
  last_error: z.string().optional(),
  broken_until: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type CountyConfig = z.infer<typeof countyConfigSchema>;

/** Firestore user_profiles collection document (stub schema) */
export const userProfileSchema = z.object({
  user_id: z.string(),
  company: z.string(),
  service_categories: z.array(z.string()),
  geography: z.array(z.string()),
  min_project_size: z.number().optional(),
  max_project_size: z.number().optional(),
  updated_at: z.string().datetime().optional(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

/** BigQuery scrape_roster row */
export const scrapeRosterRowSchema = z.object({
  county_id: z.string(),
  priority: z.number().int(),
  last_scraped_at: z.string().datetime().optional(),
  next_scrape_at: z.string().datetime().optional(),
  status: z.enum(['queued', 'in_progress', 'completed', 'skipped']),
});

export type ScrapeRosterRow = z.infer<typeof scrapeRosterRowSchema>;

/** BigQuery projects row — MERGE-upserted entity */
export const projectRowSchema = z.object({
  project_id: z.string(),
  tracking_number: z.string().optional(),
  county_id: z.string(),
  project_type: z.string().optional(),
  niche_tags: z.array(z.string()),
  estimated_budget: z.number().optional(),
  requirements: z.string().optional(),
  stage: z.enum(PROJECT_STAGES as unknown as [string, ...string[]]),
  location: z.string().optional(),
  bid_deadline: z.string().datetime().optional(),
  source_document_ids: z.array(z.string()),
  content_hash: z.string().optional(),
  first_seen_at: z.string().datetime(),
  last_updated_at: z.string().datetime(),
});

export type ProjectRow = z.infer<typeof projectRowSchema>;

/** BigQuery project_chunks row */
export const projectChunkRowSchema = z.object({
  chunk_id: z.string(),
  project_id: z.string(),
  document_id: z.string(),
  county_id: z.string(),
  parent_chunk_id: z.string().optional(),
  text: z.string(),
  is_project: z.boolean(),
  niche_tags: z.array(z.string()).optional(),
  created_at: z.string().datetime(),
});

export type ProjectChunkRow = z.infer<typeof projectChunkRowSchema>;

/** BigQuery matches row (F5 output) */
export const matchRowSchema = z.object({
  match_id: z.string(),
  user_id: z.string(),
  project_id: z.string(),
  county_id: z.string(),
  relevance_score: z.number().min(0).max(1),
  matched_at: z.string().datetime(),
  match_method: z.enum(['rule_filter', 'llm_scored', 'stub']),
});

export type MatchRow = z.infer<typeof matchRowSchema>;
