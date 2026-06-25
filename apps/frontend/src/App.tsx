import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AppShell } from './components/AppShell';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { FeedPage } from './pages/FeedPage';
import { ProjectDetailsPage } from './pages/ProjectDetailsPage';
import { TrackedPage } from './pages/TrackedPage';
import { UpdatesPage } from './pages/UpdatesPage';
import { AdminInputPage } from './pages/AdminInputPage';
import { AdminTracePage } from './pages/AdminTracePage';
import { AdminRunHistoryPage } from './pages/AdminRunHistoryPage';
import { ProfilePage } from './pages/ProfilePage';
import { useTrackedIds } from './hooks/useProjects';
import { useEffect, useState } from 'react';
import { api } from './api/client';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const PAGE_META: Record<string, [string, string]> = {
  '/': ['Dashboard', 'Your matched opportunities at a glance'],
  '/feed': ['Lead Feed', 'Browse and filter every matched project'],
  '/tracked': ['Tracked Projects', "Projects you're following through the pipeline"],
  '/updates': ['Project Updates', 'Stage changes on your tracked projects'],
  '/admin': ['Testing Console', 'Sandbox pipeline runner — nothing is saved'],
  '/admin/runs': ['Run History', 'Local sandbox run log'],
  '/admin/trace': ['Pipeline Trace', 'Step-by-step run on your test document'],
  '/profile': ['Your Profile', 'Company, service categories, and geography'],
};

function resolveMeta(pathname: string): [string, string] {
  if (pathname.startsWith('/projects/')) return ['Project Details', ''];
  if (pathname.startsWith('/admin/trace')) return PAGE_META['/admin/trace'];
  if (pathname.startsWith('/admin/runs')) return PAGE_META['/admin/runs'];
  return PAGE_META[pathname] ?? ['Beaver', ''];
}

function AppLayout() {
  const location = useLocation();
  const { trackedCount } = useTrackedIds();
  const [hasUpdates, setHasUpdates] = useState(false);

  useEffect(() => {
    api.getUpdates().then(({ updates }) => setHasUpdates(updates.length > 0)).catch(() => {});
  }, [location.pathname]);

  const [title, subtitle] = resolveMeta(location.pathname);

  return (
    <AppShell title={title} subtitle={subtitle} trackedCount={trackedCount} hasUpdates={hasUpdates}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/projects/:id" element={<ProjectDetailsPage />} />
        <Route path="/tracked" element={<TrackedPage />} />
        <Route path="/updates" element={<UpdatesPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/admin" element={<AdminRoute><AdminInputPage /></AdminRoute>} />
        <Route path="/admin/runs" element={<AdminRoute><AdminRunHistoryPage /></AdminRoute>} />
        <Route path="/admin/trace/:jobId" element={<AdminRoute><AdminTracePage /></AdminRoute>} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  const mockMode = import.meta.env.VITE_MOCK_MODE === 'true';

  return (
    <Routes>
      <Route
        path="/auth"
        element={mockMode ? <Navigate to="/" replace /> : <AuthPage />}
      />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
