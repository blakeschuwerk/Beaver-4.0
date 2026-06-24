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
