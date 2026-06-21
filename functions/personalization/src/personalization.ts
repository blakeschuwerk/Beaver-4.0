/**
 * F5 Personalization — scaffold for per-user project matching.
 *
 * DESIGN (future work — not fully implemented):
 * Step 1: Cheap niche filter — gather projects whose F4 niche_tags overlap
 *         with a user's service_categories / geography (no LLM).
 * Step 2: Llama relevance pass — for each user in the niche bundle, score
 *         "would this project require services of this user?" against their profile.
 *
 * Current scaffold: reads profiles, runs stub matching, writes placeholder matches.
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

const MOCK_MODE = process.env.MOCK_MODE === 'true';

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

/**
 * TODO Step 1: Implement cheap niche filter against projects hub (BQ).
 * Match project niche_tags + geography against user service_categories + geography.
 * Return only users whose niche overlaps with the incoming project.
 */
export function filterUsersByNiche(
  users: UserProfile[],
  project: ProjectCreatedMessage,
): UserProfile[] {
  return users.filter((user) => {
    const categoryOverlap = user.service_categories.some((cat) =>
      project.niche_tags.some((tag) => tag.toLowerCase().includes(cat.toLowerCase()) || cat.toLowerCase().includes(tag.toLowerCase())),
    );
    const geoOverlap = user.geography.some((geo) =>
      geo.toLowerCase() === project.county_id.toLowerCase() || geo.length <= 3,
    );
    return categoryOverlap || geoOverlap;
  });
}

/**
 * TODO Step 2: Call Llama with user profile + project details to produce
 * relevance_score. Only run for users returned by filterUsersByNiche.
 * Do NOT run per-user LLM for every project × every user globally.
 */
export async function scoreRelevance(
  _user: UserProfile,
  _project: ProjectCreatedMessage,
): Promise<number> {
  // STUB: return fixed score until LLM scoring is designed
  return 0.75;
}

export async function writeMatch(
  bigquery: BigQuery,
  match: {
    match_id: string;
    user_id: string;
    project_id: string;
    county_id: string;
    relevance_score: number;
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
    match_method: 'stub',
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
  status: 'stub';
}

export async function runPersonalization(project: ProjectCreatedMessage): Promise<PersonalizationResult> {
  const firestore = new Firestore({ databaseId: process.env.FIRESTORE_DATABASE ?? '(default)' });
  const bigquery = new BigQuery();
  const pubsub = new PubSub();

  const users = await loadUserProfiles(firestore);
  const nicheUsers = filterUsersByNiche(users, project);

  let matchesCreated = 0;

  for (const user of nicheUsers) {
    const relevanceScore = await scoreRelevance(user, project);
    if (relevanceScore < 0.5) continue;

    const matchId = `match-${user.user_id}-${project.project_id}`;
    await writeMatch(bigquery, {
      match_id: matchId,
      user_id: user.user_id,
      project_id: project.project_id,
      county_id: project.county_id,
      relevance_score: relevanceScore,
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
    status: 'stub',
  };
}
