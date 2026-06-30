import { Firestore } from '@google-cloud/firestore';
import {
  FS_COUNTIES_COLLECTION,
  FS_TRACKED_PROJECTS_COLLECTION,
  FS_USER_PROFILES_COLLECTION,
  type CountyConfig,
  type TrackedProject,
  type UserProfile,
  countyConfigSchema,
  trackedProjectSchema,
  userProfileSchema,
} from '@beaver/shared';
import { isMockMode, isReadOnly } from './auth.js';
import {
  MOCK_COUNTIES,
  MOCK_TRACKS,
  MOCK_USER,
} from './mock/fixtures.js';

const DATABASE_ID = process.env.FIRESTORE_DATABASE ?? 'beaver-firebase';

let firestore: Firestore | undefined;

function getFirestore(): Firestore {
  if (!firestore) {
    firestore = new Firestore({ projectId: process.env.GCP_PROJECT_ID, databaseId: DATABASE_ID });
  }
  return firestore;
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  if (isMockMode()) {
    return userId === MOCK_USER.user_id ? { ...MOCK_USER } : null;
  }

  const doc = await getFirestore().collection(FS_USER_PROFILES_COLLECTION).doc(userId).get();
  if (!doc.exists) return null;
  return userProfileSchema.parse({ user_id: userId, ...doc.data() });
}

export async function createProfile(profile: UserProfile): Promise<UserProfile> {
  const parsed = userProfileSchema.parse(profile);
  if (isMockMode()) {
    Object.assign(MOCK_USER, parsed);
    return { ...MOCK_USER };
  }
  if (isReadOnly()) {
    console.log(`[read-only] skip Firestore write: createProfile ${parsed.user_id}`);
    return parsed;
  }

  await getFirestore()
    .collection(FS_USER_PROFILES_COLLECTION)
    .doc(parsed.user_id)
    .set({ ...parsed, updated_at: new Date().toISOString() }, { merge: true });
  return parsed;
}

export async function updateProfile(
  userId: string,
  updates: Partial<Omit<UserProfile, 'user_id'>>,
): Promise<UserProfile> {
  const existing = await getProfile(userId);
  if (!existing) throw new Error('Profile not found');

  const merged = userProfileSchema.parse({
    ...existing,
    ...updates,
    user_id: userId,
    updated_at: new Date().toISOString(),
  });

  if (isMockMode()) {
    Object.assign(MOCK_USER, merged);
    return { ...MOCK_USER };
  }
  if (isReadOnly()) {
    console.log(`[read-only] skip Firestore write: updateProfile ${userId}`);
    return merged;
  }

  await getFirestore()
    .collection(FS_USER_PROFILES_COLLECTION)
    .doc(userId)
    .set({ ...merged }, { merge: true });
  return merged;
}

export async function listCounties(): Promise<CountyConfig[]> {
  if (isMockMode()) return [...MOCK_COUNTIES];

  const snap = await getFirestore().collection(FS_COUNTIES_COLLECTION).get();
  return snap.docs.map((doc) => countyConfigSchema.parse({ county_id: doc.id, ...doc.data() }));
}

export async function listTracks(userId: string): Promise<TrackedProject[]> {
  if (isMockMode()) {
    return MOCK_TRACKS.filter((t) => t.user_id === userId).map((t) => ({ ...t }));
  }

  const snap = await getFirestore()
    .collection(FS_TRACKED_PROJECTS_COLLECTION)
    .where('user_id', '==', userId)
    .get();

  return snap.docs.map((doc) => trackedProjectSchema.parse(doc.data()));
}

export async function addTrack(userId: string, projectId: string): Promise<TrackedProject> {
  const track: TrackedProject = {
    user_id: userId,
    project_id: projectId,
    tracked_at: new Date().toISOString(),
  };

  if (isMockMode()) {
    const existing = MOCK_TRACKS.find((t) => t.user_id === userId && t.project_id === projectId);
    if (existing) return { ...existing };
    MOCK_TRACKS.push(track);
    return { ...track };
  }
  if (isReadOnly()) {
    console.log(`[read-only] skip Firestore write: addTrack ${userId}/${projectId}`);
    return track;
  }

  const docId = `${userId}_${projectId}`;
  await getFirestore().collection(FS_TRACKED_PROJECTS_COLLECTION).doc(docId).set(track);
  return track;
}

export async function removeTrack(userId: string, projectId: string): Promise<void> {
  if (isMockMode()) {
    const idx = MOCK_TRACKS.findIndex((t) => t.user_id === userId && t.project_id === projectId);
    if (idx >= 0) MOCK_TRACKS.splice(idx, 1);
    return;
  }
  if (isReadOnly()) {
    console.log(`[read-only] skip Firestore write: removeTrack ${userId}/${projectId}`);
    return;
  }

  const docId = `${userId}_${projectId}`;
  await getFirestore().collection(FS_TRACKED_PROJECTS_COLLECTION).doc(docId).delete();
}

export async function updateTrackStage(
  userId: string,
  projectId: string,
  stage: string,
): Promise<void> {
  if (isMockMode()) {
    const track = MOCK_TRACKS.find((t) => t.user_id === userId && t.project_id === projectId);
    if (track) track.last_viewed_stage = stage as TrackedProject['last_viewed_stage'];
    return;
  }
  if (isReadOnly()) {
    console.log(`[read-only] skip Firestore write: updateTrackStage ${userId}/${projectId}`);
    return;
  }

  const docId = `${userId}_${projectId}`;
  await getFirestore()
    .collection(FS_TRACKED_PROJECTS_COLLECTION)
    .doc(docId)
    .set({ last_viewed_stage: stage }, { merge: true });
}
