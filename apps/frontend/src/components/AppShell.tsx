import type { ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  IconHome,
  IconSearch,
  IconBookmark,
  IconBell,
  IconFlask,
} from './Icons';
import { initials } from '../lib/utils';
import './AppShell.css';

interface AppShellProps {
  title: string;
  subtitle: string;
  trackedCount?: number;
  hasUpdates?: boolean;
  children?: ReactNode;
}

export function AppShell({ title, subtitle, trackedCount = 0, hasUpdates, children }: AppShellProps) {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__logo">
          <div className="sidebar__mark">
            <span />
            <span />
          </div>
          <span className="sidebar__brand">Beaver</span>
        </div>

        <nav className="sidebar__nav">
          <NavLink to="/" end className={({ isActive }) => `sidebar__item${isActive ? ' sidebar__item--active' : ''}`}>
            <IconHome size={17} />
            Dashboard
          </NavLink>
          <NavLink to="/feed" className={({ isActive }) => `sidebar__item${isActive ? ' sidebar__item--active' : ''}`}>
            <IconSearch size={17} />
            Lead Feed
          </NavLink>
          <NavLink to="/tracked" className={({ isActive }) => `sidebar__item${isActive ? ' sidebar__item--active' : ''}`}>
            <IconBookmark size={17} />
            Tracked
            {trackedCount > 0 && <span className="sidebar__badge">{trackedCount}</span>}
          </NavLink>
          <NavLink to="/updates" className={({ isActive }) => `sidebar__item${isActive ? ' sidebar__item--active' : ''}`}>
            <IconBell size={17} />
            Updates
            {hasUpdates && <span className="sidebar__dot" />}
          </NavLink>

          {isAdmin && (
            <>
              <div className="sidebar__divider" />
              <div className="sidebar__section-label">Admin</div>
              <NavLink to="/admin" className={({ isActive }) => `sidebar__item${isActive ? ' sidebar__item--active' : ''}`}>
                <IconFlask size={17} />
                Testing Console
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__account">
            <div className="sidebar__avatar">{initials(user?.company ?? 'U')}</div>
            <div>
              <div className="sidebar__name">{user?.company ?? 'User'}</div>
              <div className="sidebar__company">{user?.role === 'admin' ? 'Admin' : 'Contractor'}</div>
            </div>
          </div>
          <button type="button" className="sidebar__signout" onClick={() => signOut().then(() => navigate('/auth'))}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <div>
            <h1 className="app-header__title">{title}</h1>
            <p className="app-header__subtitle">{subtitle}</p>
          </div>
        </header>
        <main className="app-content screen-enter">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
