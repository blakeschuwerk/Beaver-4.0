import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { UserProfile } from '../types';
import { api, setAuthToken } from '../api/client';

const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === 'true';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (data: {
    email: string;
    password: string;
    company: string;
    service_categories: string[];
    geography: string[];
  }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    try {
      const { profile } = await api.getProfile();
      setUser(profile);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    async function init() {
      if (MOCK_MODE) {
        setAuthToken('mock-token');
        try {
          const { profile } = await api.getProfile();
          setUser(profile);
        } catch {
          setUser({
            user_id: 'mock-user-001',
            company: 'Demo Civil Contractors',
            service_categories: ['Roadway', 'Drainage', 'Earthwork'],
            geography: ['Nash County, NC'],
            role: 'admin',
          });
        }
        setLoading(false);
        return;
      }

      try {
        const { initializeApp } = await import('firebase/app');
        const { getAuth, onAuthStateChanged } = await import('firebase/auth');
        const firebaseConfig = {
          apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
          authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
          projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'beaver4',
        };
        initializeApp(firebaseConfig);
        const auth = getAuth();

        onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
            const token = await firebaseUser.getIdToken();
            setAuthToken(token);
            await refreshProfile();
          } else {
            setAuthToken(null);
            setUser(null);
          }
          setLoading(false);
        });
      } catch {
        setLoading(false);
      }
    }
    init();
  }, [refreshProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (MOCK_MODE) {
      setAuthToken('mock-token');
      await refreshProfile();
      return;
    }
    const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
    const cred = await signInWithEmailAndPassword(getAuth(), email, password);
    const token = await cred.user.getIdToken();
    setAuthToken(token);
    await refreshProfile();
  }, [refreshProfile]);

  const signUp = useCallback(
    async (data: {
      email: string;
      password: string;
      company: string;
      service_categories: string[];
      geography: string[];
    }) => {
      if (MOCK_MODE) {
        setAuthToken('mock-token');
        const { profile } = await api.createProfile({
          company: data.company,
          service_categories: data.service_categories,
          geography: data.geography,
        });
        setUser(profile);
        return;
      }

      const { getAuth, createUserWithEmailAndPassword } = await import('firebase/auth');
      const cred = await createUserWithEmailAndPassword(getAuth(), data.email, data.password);
      const token = await cred.user.getIdToken();
      setAuthToken(token);
      const { profile } = await api.createProfile({
        company: data.company,
        service_categories: data.service_categories,
        geography: data.geography,
      });
      setUser(profile);
    },
    [],
  );

  const signOut = useCallback(async () => {
    if (!MOCK_MODE) {
      const { getAuth, signOut: firebaseSignOut } = await import('firebase/auth');
      await firebaseSignOut(getAuth());
    }
    setAuthToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAdmin: user?.role === 'admin',
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [user, loading, signIn, signUp, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
