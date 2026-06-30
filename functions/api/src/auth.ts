import type { NextFunction, Request, Response } from 'express';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { UserProfile } from '@beaver/shared';
import { MOCK_USER } from './mock/fixtures.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  profile?: UserProfile;
}

const MOCK_MODE = process.env.MOCK_MODE === 'true';
// Local read-only mode: read REAL BigQuery/Firestore but suppress every write,
// with the LLM running locally instead of RunPod. This is "run my app locally"
// — the full backend with nothing persisted. Distinct from MOCK_MODE, which
// serves canned fixtures and runs no real logic.
const READ_ONLY = process.env.LOCAL_NO_WRITES === 'true';
// In read-only mode, impersonate this real user id so you can see your own real
// projects/matches without going through a Firebase login locally.
const LOCAL_USER_ID = process.env.LOCAL_USER_ID;

let firebaseApp: App | undefined;

function getFirebaseApp(): App {
  if (firebaseApp) return firebaseApp;
  if (getApps().length > 0) {
    firebaseApp = getApps()[0];
    return firebaseApp;
  }
  const projectId = process.env.GCP_PROJECT_ID ?? 'beaver4';
  firebaseApp = initializeApp({ projectId });
  return firebaseApp;
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (MOCK_MODE) {
    req.userId = MOCK_USER.user_id;
    req.profile = { ...MOCK_USER };
    next();
    return;
  }

  // Local read-only: skip Firebase login and act as the configured real user so
  // reads return real data. Preload the real profile so admin/sandbox routes work.
  if (READ_ONLY && LOCAL_USER_ID) {
    req.userId = LOCAL_USER_ID;
    try {
      // Dynamic import avoids a static auth.ts <-> firestore.ts import cycle.
      const { getProfile } = await import('./firestore.js');
      const profile = await getProfile(LOCAL_USER_ID);
      if (profile) req.profile = profile;
    } catch (error) {
      console.warn(`[read-only] could not preload profile for ${LOCAL_USER_ID}:`, error);
    }
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  try {
    getFirebaseApp();
    const token = header.slice(7);
    const decoded = await getAuth().verifyIdToken(token);
    req.userId = decoded.uid;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.profile?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

export function isMockMode(): boolean {
  return MOCK_MODE;
}

/** True when running locally with real reads but writes suppressed. */
export function isReadOnly(): boolean {
  return READ_ONLY;
}
