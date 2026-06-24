import { BigQuery } from '@google-cloud/bigquery';
import {
  BQ_DATASET,
  BQ_TABLE_MATCHES,
  BQ_TABLE_PROJECTS,
  type MatchRow,
  type ProjectRow,
  matchRowSchema,
  projectRowSchema,
} from '@beaver/shared';
import { countyLabelMatchesFilter, parseUSCountyLabel } from '@beaver/shared/us-counties';
import { isMockMode } from './auth.js';
import { MOCK_COUNTIES, MOCK_MATCHES, MOCK_PROJECTS } from './mock/fixtures.js';

let bigquery: BigQuery | undefined;

function getBigQuery(): BigQuery {
  if (!bigquery) {
    bigquery = new BigQuery({ projectId: process.env.GCP_PROJECT_ID });
  }
  return bigquery;
}

const DEDUPED_PROJECTS_CTE = `
  WITH deduped AS (
    SELECT *,
      ROW_NUMBER() OVER (
        PARTITION BY project_id
        ORDER BY last_updated_at DESC, first_seen_at DESC
      ) AS rn
    FROM \`${process.env.GCP_PROJECT_ID}.${BQ_DATASET}.${BQ_TABLE_PROJECTS}\`
  )
  SELECT * EXCEPT(rn) FROM deduped WHERE rn = 1
`;

export interface ProjectFilters {
  stage?: string;
  county?: string;
  tag?: string;
  minMatch?: number;
  query?: string;
  userId: string;
}

export interface EnrichedProject extends ProjectRow {
  relevance_score?: number;
  rationale?: string;
  match_id?: string;
}

function parseProjectRow(row: Record<string, unknown>): ProjectRow {
  return projectRowSchema.parse({
    ...row,
    niche_tags: row.niche_tags ?? [],
    source_document_ids: row.source_document_ids ?? [],
    first_seen_at: normalizeTimestamp(row.first_seen_at),
    last_updated_at: normalizeTimestamp(row.last_updated_at),
    bid_deadline: row.bid_deadline ? normalizeTimestamp(row.bid_deadline) : undefined,
  });
}

function parseMatchRow(row: Record<string, unknown>): MatchRow {
  return matchRowSchema.parse({
    ...row,
    matched_at: normalizeTimestamp(row.matched_at),
  });
}

function normalizeTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return String((value as { value: string }).value);
  }
  return String(value);
}

function countyMetaFromId(countyId: string): { name: string; state: string } {
  const fromConfig = MOCK_COUNTIES.find((c) => c.county_id === countyId);
  if (fromConfig) {
    return { name: fromConfig.name, state: fromConfig.state };
  }

  const match = countyId.match(/^([a-z]{2})-(.+)$/i);
  if (!match) return { name: countyId, state: '' };

  const state = match[1].toUpperCase();
  const base = match[2].replace(/county$/i, '');
  const name = `${base.charAt(0).toUpperCase()}${base.slice(1)} County`;
  return { name, state };
}

function matchesCountyFilter(project: ProjectRow, filterCounty: string): boolean {
  const meta = countyMetaFromId(project.county_id);
  return countyLabelMatchesFilter(filterCounty, project.county_id, meta.name, meta.state);
}

function filterMockProjects(filters: ProjectFilters): EnrichedProject[] {
  const matches = MOCK_MATCHES.filter((m) => m.user_id === filters.userId);
  const matchByProject = new Map(matches.map((m) => [m.project_id, m]));

  let results: EnrichedProject[] = MOCK_PROJECTS.map((p) => {
    const match = matchByProject.get(p.project_id);
    return {
      ...p,
      relevance_score: match?.relevance_score,
      match_id: match?.match_id,
    };
  });

  if (filters.stage && filters.stage !== 'all') {
    results = results.filter((p) => p.stage === filters.stage);
  }
  if (filters.county && filters.county !== 'all') {
    results = results.filter((p) => matchesCountyFilter(p, filters.county!));
  }
  if (filters.tag && filters.tag !== 'all') {
    results = results.filter((p) =>
      p.niche_tags.some((t) => t.toLowerCase() === filters.tag!.toLowerCase()),
    );
  }
  if (filters.minMatch !== undefined && filters.minMatch > 0) {
    const threshold = filters.minMatch / 100;
    results = results.filter((p) => (p.relevance_score ?? 0) >= threshold);
  }
  if (filters.query) {
    const q = filters.query.toLowerCase();
    results = results.filter(
      (p) =>
        (p.project_type ?? '').toLowerCase().includes(q) ||
        (p.tracking_number ?? '').toLowerCase().includes(q) ||
        (p.requirements ?? '').toLowerCase().includes(q) ||
        p.county_id.toLowerCase().includes(q),
    );
  }

  return results.sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));
}

export async function listProjects(filters: ProjectFilters): Promise<EnrichedProject[]> {
  if (isMockMode()) return filterMockProjects(filters);

  const params: Record<string, string | number> = { userId: filters.userId };
  const conditions: string[] = ['m.user_id = @userId'];

  if (filters.stage && filters.stage !== 'all') {
    conditions.push('p.stage = @stage');
    params.stage = filters.stage;
  }
  if (filters.county && filters.county !== 'all') {
    const parsed = parseUSCountyLabel(filters.county);
    if (parsed) {
      const namePart = parsed.name.replace(/\s+County$/i, '').toLowerCase().replace(/\s+/g, '');
      conditions.push(`(
        p.county_id = @county
        OR LOWER(p.county_id) LIKE CONCAT("%", LOWER(@county), "%")
        OR (
          LOWER(p.county_id) LIKE CONCAT(LOWER(@countyStatePrefix), "%")
          AND LOWER(p.county_id) LIKE CONCAT("%", LOWER(@countyNamePart), "%")
        )
      )`);
      params.county = filters.county;
      params.countyStatePrefix = `${parsed.state.toLowerCase()}-`;
      params.countyNamePart = namePart;
    } else {
      conditions.push('(p.county_id = @county OR LOWER(p.county_id) LIKE CONCAT("%", LOWER(@county), "%"))');
      params.county = filters.county;
    }
  }
  if (filters.tag && filters.tag !== 'all') {
    conditions.push('EXISTS (SELECT 1 FROM UNNEST(p.niche_tags) t WHERE LOWER(t) = LOWER(@tag))');
    params.tag = filters.tag;
  }
  if (filters.minMatch !== undefined && filters.minMatch > 0) {
    conditions.push('m.relevance_score >= @minMatch');
    params.minMatch = filters.minMatch / 100;
  }
  if (filters.query) {
    conditions.push(`(
      LOWER(COALESCE(p.project_type, "")) LIKE CONCAT("%", LOWER(@query), "%")
      OR LOWER(COALESCE(p.tracking_number, "")) LIKE CONCAT("%", LOWER(@query), "%")
      OR LOWER(COALESCE(p.requirements, "")) LIKE CONCAT("%", LOWER(@query), "%")
      OR LOWER(p.county_id) LIKE CONCAT("%", LOWER(@query), "%")
    )`);
    params.query = filters.query;
  }

  const query = `
    WITH deduped AS (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY project_id
          ORDER BY last_updated_at DESC, first_seen_at DESC
        ) AS rn
      FROM \`${process.env.GCP_PROJECT_ID}.${BQ_DATASET}.${BQ_TABLE_PROJECTS}\`
    ),
    projects AS (SELECT * EXCEPT(rn) FROM deduped WHERE rn = 1)
    SELECT p.*, m.relevance_score, m.match_id, m.match_method
    FROM projects p
    INNER JOIN \`${process.env.GCP_PROJECT_ID}.${BQ_DATASET}.${BQ_TABLE_MATCHES}\` m
      ON p.project_id = m.project_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY m.relevance_score DESC
  `;

  const [rows] = await getBigQuery().query({ query, params });
  return rows.map((row: Record<string, unknown>) => ({
    ...parseProjectRow(row),
    relevance_score: Number(row.relevance_score),
    match_id: String(row.match_id),
  }));
}

export async function getProjectById(
  projectId: string,
  userId: string,
): Promise<EnrichedProject | null> {
  if (isMockMode()) {
    const results = filterMockProjects({ userId });
    return results.find((p) => p.project_id === projectId) ?? null;
  }

  const query = `
    WITH deduped AS (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY project_id
          ORDER BY last_updated_at DESC, first_seen_at DESC
        ) AS rn
      FROM \`${process.env.GCP_PROJECT_ID}.${BQ_DATASET}.${BQ_TABLE_PROJECTS}\`
    ),
    projects AS (SELECT * EXCEPT(rn) FROM deduped WHERE rn = 1)
    SELECT p.*, m.relevance_score, m.match_id
    FROM projects p
    LEFT JOIN \`${process.env.GCP_PROJECT_ID}.${BQ_DATASET}.${BQ_TABLE_MATCHES}\` m
      ON p.project_id = m.project_id AND m.user_id = @userId
    WHERE p.project_id = @projectId
    LIMIT 1
  `;

  const [rows] = await getBigQuery().query({
    query,
    params: { projectId, userId },
  });

  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  return {
    ...parseProjectRow(row),
    relevance_score: row.relevance_score != null ? Number(row.relevance_score) : undefined,
    match_id: row.match_id ? String(row.match_id) : undefined,
  };
}

export async function listMatches(userId: string): Promise<EnrichedProject[]> {
  return listProjects({ userId });
}

export async function listAllProjects(): Promise<ProjectRow[]> {
  if (isMockMode()) return [...MOCK_PROJECTS];

  const query = `${DEDUPED_PROJECTS_CTE}`;
  const [rows] = await getBigQuery().query({ query });
  return rows.map((row: Record<string, unknown>) => parseProjectRow(row));
}

export async function getMatchForProject(
  userId: string,
  projectId: string,
): Promise<MatchRow | null> {
  if (isMockMode()) {
    const match = MOCK_MATCHES.find((m) => m.user_id === userId && m.project_id === projectId);
    return match ? { ...match } : null;
  }

  const query = `
    SELECT * FROM \`${process.env.GCP_PROJECT_ID}.${BQ_DATASET}.${BQ_TABLE_MATCHES}\`
    WHERE user_id = @userId AND project_id = @projectId
    ORDER BY matched_at DESC
    LIMIT 1
  `;
  const [rows] = await getBigQuery().query({ query, params: { userId, projectId } });
  if (rows.length === 0) return null;
  return parseMatchRow(rows[0] as Record<string, unknown>);
}
