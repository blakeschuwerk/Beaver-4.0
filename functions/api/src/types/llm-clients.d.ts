declare module '@beaver/classifier/dist/llm-client.js' {
  export interface ClassificationResult {
    is_project: boolean;
    tracking_number?: string;
    project_type?: string;
    niche_tags: string[];
    stage: 'subcommittee' | 'approved' | 'bidding' | 'awarded' | 'closed';
    estimated_budget?: number;
    requirements?: string;
    location?: string;
    bid_deadline?: string;
    confidence: number;
  }

  export function classifyChunk(text: string): Promise<ClassificationResult>;
}

declare module '@beaver/personalization/dist/llm-client.js' {
  import type { ProjectCreatedMessage, UserProfile } from '@beaver/shared';

  export interface RelevanceResult {
    relevance_score: number;
    rationale?: string;
  }

  export function scoreProjectRelevance(
    user: UserProfile,
    project: ProjectCreatedMessage,
  ): Promise<RelevanceResult>;
}
