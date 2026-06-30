/**
 * F5 Personalization — per-user project matching (niche filter → LLM relevance).
 */

import { randomUUID } from 'node:crypto';
import {
  BQ_DATASET,
  BQ_TABLE_MATCHES,
  FS_USER_PROFILES_COLLECTION,
  TOPIC_MATCHES_CREATED,
  createBaseMessage,
  matchCreatedSchema,
  type ProjectCreatedMessage,
  type UserProfile,
} from '@beaver/shared';
import { BigQuery } from '@google-cloud/bigquery';
import { Firestore } from '@google-cloud/firestore';
import { PubSub } from '@google-cloud/pubsub';
import { geographyMatchesCounty } from '@beaver/shared/us-counties';
import { scoreProjectRelevance } from './llm-client.js';

const MOCK_MODE = process.env.MOCK_MODE === 'true';
const MATCH_MIN_RELEVANCE = Number(process.env.MATCH_MIN_RELEVANCE ?? '0.5');
const MATCH_MAX_PER_PROJECT = Number(process.env.MATCH_MAX_PER_PROJECT ?? '10');

export async function loadUserProfiles(firestore: Firestore): Promise<UserProfile[]> {
  if (MOCK_MODE) {
    return [
      {
        user_id: 'user-demo-1',
        company: 'Demo Civil Contractors',
        service_categories: ['roadway', 'drainage', 'civil'],
        geography: ['CA', 'demo-county'],
      },
    ];
  }

  const snapshot = await firestore.collection(FS_USER_PROFILES_COLLECTION).get();
  return snapshot.docs.map((doc) => doc.data() as UserProfile);
}

function nicheOverlap(userCategories: string[], projectTags: string[]): boolean {
  return userCategories.some((cat) =>
    projectTags.some((tag) =>
      tag.toLowerCase().includes(cat.toLowerCase()) || cat.toLowerCase().includes(tag.toLowerCase()),
    ),
  );
}

function countyMetaFromId(countyId: string): { name: string; state: string } {
  const match = countyId.match(/^([a-z]{2})-(.+)$/i);
  if (!match) return { name: countyId, state: '' };

  const state = match[1].toUpperCase();
  const base = match[2].replace(/county$/i, '');
  const name = `${base.charAt(0).toUpperCase()}${base.slice(1)} County`;
  return { name, state };
}

function geographyOverlap(
  userGeography: string[],
  countyId: string,
  countyState?: string,
  countyName?: string,
): boolean {
  const inferred = countyMetaFromId(countyId);
  const state = countyState ?? inferred.state;
  const name = countyName ?? inferred.name;
  return geographyMatchesCounty(userGeography, countyId, name, state);
}

/**
 * Cheap niche filter — no LLM. Returns users with category OR geography overlap.
 */
export function filterUsersByNiche(
  users: UserProfile[],
  project: ProjectCreatedMessage,
  countyState?: string,
): UserProfile[] {
  return users.filter((user) => {
    const categoryMatch = nicheOverlap(user.service_categories, project.niche_tags);
    const geoMatch = geographyOverlap(user.geography, project.county_id, countyState);
    return categoryMatch && geoMatch;
  });
}

export async function scoreRelevance(
  user: UserProfile,
  project: ProjectCreatedMessage,
): Promise<number> {
  const result = await scoreProjectRelevance(user, project);
  return result.relevance_score;
}

export async function writeMatch(
  bigquery: BigQuery,
  match: {
    match_id: string;
    user_id: string;
    project_id: string;
    county_id: string;
    relevance_score: number;
    match_method?: string;
  },
): Promise<void> {
  if (MOCK_MODE) {
    console.log('[MOCK] Write match:', match);
    return;
  }

  const table = bigquery.dataset(BQ_DATASET).table(BQ_TABLE_MATCHES);
  await table.insert([{
    match_id: match.match_id,
    user_id: match.user_id,
    project_id: match.project_id,
    county_id: match.county_id,
    relevance_score: match.relevance_score,
    matched_at: new Date().toISOString(),
    match_method: match.match_method ?? 'llm',
  }]);
}

export async function publishMatchCreated(
  pubsub: PubSub,
  message: {
    match_id: string;
    user_id: string;
    project_id: string;
    relevance_score: number;
    county_id: string;
    trace_id: string;
  },
): Promise<void> {
  const payload = matchCreatedSchema.parse({
    ...createBaseMessage(message.trace_id),
    match_id: message.match_id,
    user_id: message.user_id,
    project_id: message.project_id,
    relevance_score: message.relevance_score,
    county_id: message.county_id,
  });

  if (MOCK_MODE) {
    console.log('[MOCK] Published match-created:', payload);
    return;
  }

  await pubsub.topic(TOPIC_MATCHES_CREATED).publishMessage({
    data: Buffer.from(JSON.stringify(payload)),
  });
}

export interface PersonalizationResult {
  trace_id: string;
  matches_created: number;
  status: 'ok' | 'stub';
}

export async function runPersonalization(project: ProjectCreatedMessage): Promise<PersonalizationResult> {
  const firestore = new Firestore({ databaseId: process.env.FIRESTORE_DATABASE ?? '(default)' });
  const bigquery = new BigQuery();
  const pubsub = new PubSub();

  const users = await loadUserProfiles(firestore);
  const nicheUsers = filterUsersByNiche(users, project);

  let matchesCreated = 0;

  for (const user of nicheUsers.slice(0, MATCH_MAX_PER_PROJECT)) {
    const relevanceScore = await scoreRelevance(user, project);
    if (relevanceScore < MATCH_MIN_RELEVANCE) continue;

    const matchId = `match-${user.user_id}-${project.project_id}`;
    await writeMatch(bigquery, {
      match_id: matchId,
      user_id: user.user_id,
      project_id: project.project_id,
      county_id: project.county_id,
      relevance_score: relevanceScore,
      match_method: 'llm',
    });

    await publishMatchCreated(pubsub, {
      match_id: matchId,
      user_id: user.user_id,
      project_id: project.project_id,
      relevance_score: relevanceScore,
      county_id: project.county_id,
      trace_id: project.trace_id,
    });

    matchesCreated += 1;
  }

  return {
    trace_id: project.trace_id,
    matches_created: matchesCreated,
    status: 'ok',
  };
}

// Re-export for tests
export { nicheOverlap, geographyOverlap, MATCH_MIN_RELEVANCE, MATCH_MAX_PER_PROJECT };
