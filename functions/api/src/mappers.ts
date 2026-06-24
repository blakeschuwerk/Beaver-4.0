import type { ProjectRow } from '@beaver/shared';
import { STAGE_DISPLAY_LABELS } from '@beaver/shared';
import type { EnrichedProject } from './bq.js';
import { MOCK_COUNTIES, MOCK_RATIONALES } from './mock/fixtures.js';

export interface ApiProject {
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

function countyName(countyId: string): string {
  const county = MOCK_COUNTIES.find((c: { county_id: string; name: string }) => c.county_id === countyId);
  if (county) return county.name;
  return countyId
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDeadline(deadline?: string): string {
  if (!deadline) return 'TBD';
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return 'TBD';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export function mapProject(
  row: EnrichedProject | ProjectRow,
  options: {
    relevanceScore?: number;
    rationale?: string;
    changed?: boolean;
    fromStage?: string;
    toStage?: string;
    changedAt?: string;
  } = {},
): ApiProject {
  const enriched = row as EnrichedProject;
  const score = options.relevanceScore ?? enriched.relevance_score ?? null;
  const stage = row.stage;

  return {
    id: row.project_id,
    name: row.project_type ?? row.tracking_number ?? row.project_id,
    agency: `${countyName(row.county_id)} · ${row.county_id.split('-')[0]?.toUpperCase() ?? ''}`,
    county: countyName(row.county_id),
    county_id: row.county_id,
    budget: row.estimated_budget ?? null,
    stage,
    stage_label: STAGE_DISPLAY_LABELS[stage as keyof typeof STAGE_DISPLAY_LABELS] ?? stage,
    match: score != null ? Math.round(score * 100) : null,
    relevance_score: score,
    type: row.project_type ?? 'Infrastructure',
    tracking: row.tracking_number ?? '—',
    deadline: formatDeadline(row.bid_deadline),
    location: row.location ?? countyName(row.county_id),
    requirements: row.requirements ?? '',
    tags: row.niche_tags ?? [],
    rationale:
      options.rationale ??
      MOCK_RATIONALES[row.project_id] ??
      'Matched based on your service categories and geography.',
    changed: options.changed ?? false,
    from: options.fromStage,
    to: options.toStage,
    ago: options.changedAt ? formatAgo(options.changedAt) : undefined,
  };
}

export function mapProjects(rows: EnrichedProject[]): ApiProject[] {
  return rows.map((row) => mapProject(row));
}
