export interface UserProfile {
  user_id: string;
  company: string;
  service_categories: string[];
  geography: string[];
  role?: 'user' | 'admin';
  min_project_size?: number;
  max_project_size?: number;
  updated_at?: string;
}

export interface CountyConfig {
  county_id: string;
  name: string;
  state: string;
  source_urls: string[];
  scraper_strategy: string;
  platform?: string;
  broken?: boolean;
}

export interface Project {
  id: string;
  name: string;
  agency: string;
  county: string;
  county_id: string;
  budget: number | null;
  stage: string;
  stage_label: string;
  match: number | null;
  relevance_score: number | null;
  type: string;
  tracking: string;
  deadline: string;
  location: string;
  requirements: string;
  tags: string[];
  rationale: string;
  changed: boolean;
  from?: string;
  to?: string;
  ago?: string;
}

export interface StageUpdate {
  project_id: string;
  name: string;
  from_stage: string;
  to_stage: string;
  from_label: string;
  to_label: string;
  changed_at: string;
  ago: string;
}

export interface PipelineTrace {
  job_id: string;
  status: 'running' | 'complete' | 'error';
  error?: string;
  steps: {
    scraper: {
      documents_discovered: number;
      doc_type: string;
      circuit_breaker: string;
    };
    extraction: {
      parent_chunks: number;
      child_chunks: number;
      text_preview: string;
      chunks: Array<{ chunk_id: string; text: string }>;
    };
    classifier_filter: Array<{
      chunk_id: string;
      text_preview: string;
      is_project: boolean;
    }>;
    classifier_extraction: Record<string, unknown> | null;
    relevance: {
      relevance_score: number;
      match_percent: number;
      rationale?: string;
    } | null;
  };
}

export const SERVICE_CATEGORIES = [
  'Roadway',
  'Drainage',
  'Earthwork',
  'Concrete',
  'Structural',
  'HVAC',
  'Mechanical',
  'Electrical',
  'Striping',
] as const;

export const STAGE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'subcommittee', label: 'Early Planning' },
  { key: 'approved', label: 'Approved' },
  { key: 'bidding', label: 'Out for Bid' },
  { key: 'awarded', label: 'Awarded' },
  { key: 'closed', label: 'Closed' },
] as const;