import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from './ThemeToggle';
import RightPaceSidebar from './RightPaceSidebar';

const LEFT_STORAGE_KEY = 'prime:sidebar-collapsed';
const RIGHT_STORAGE_KEY = 'prime:right-sidebar-collapsed';

export default function Layout() {
  const { user, signOut } = useAuth();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(LEFT_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(RIGHT_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(LEFT_STORAGE_KEY, String(collapsed));
    } catch {
      // localStorage may be unavailable; ignore
    }
  }, [collapsed]);

  useEffect(() => {
    try {
      window.localStorage.setItem(RIGHT_STORAGE_KEY, String(rightCollapsed));
    } catch {
      // localStorage may be unavailable; ignore
    }
  }, [rightCollapsed]);

  // Close the mobile drawer when navigating between routes
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Allow Escape to close the mobile drawer
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const widthClass = collapsed ? 'w-16' : 'w-60';
  const rightWidthClass = rightCollapsed ? 'w-12' : 'w-64';
  const mainLeftPadClass = collapsed ? 'md:pl-16' : 'md:pl-60';
  const mainRightPadClass = rightCollapsed ? 'md:pr-12' : 'md:pr-64';

  return (
    <div className="relative min-h-screen">
      {/* Mobile top bar (hidden on md+) */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border/70 bg-bg/70 px-4 py-3 backdrop-blur-xl supports-[backdrop-filter]:bg-bg/55 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="btn-ghost !px-2 !py-1.5"
        >
          <MenuIcon />
        </button>
        <Link
          to="/projects"
          className="group flex items-center gap-1.5 text-base font-semibold tracking-tight text-fg"
        >
          <span>prime</span>
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-accent transition-transform duration-200 group-hover:scale-125"
            aria-hidden
          />
        </Link>
      </header>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        aria-label="Primary"
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border/70 bg-bg/85 backdrop-blur-xl supports-[backdrop-filter]:bg-bg/65 transition-[width,transform] duration-200 ease-out ${widthClass} ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div
          className={`flex items-center gap-2 px-3 py-3 ${
            collapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          {!collapsed && (
            <Link
              to="/projects"
              className="group flex items-center gap-1.5 text-base font-semibold tracking-tight text-fg"
            >
              <span>prime</span>
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-accent transition-transform duration-200 group-hover:scale-125"
                aria-hidden
              />
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              if (mobileOpen) {
                setMobileOpen(false);
              } else {
                setCollapsed((c) => !c);
              }
            }}
            aria-label={
              mobileOpen
                ? 'Close navigation'
                : collapsed
                  ? 'Expand sidebar'
                  : 'Collapse sidebar'
            }
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="btn-ghost !px-2 !py-1.5"
          >
            <ChevronIcon collapsed={collapsed} />
          </button>
        </div>

        <nav
          className="flex flex-1 flex-col gap-0.5 px-2 text-sm"
          aria-label="Sections"
        >
          <SidebarLink
            to="/projects"
            label="Projects"
            collapsed={collapsed}
            icon={<ProjectsIcon />}
          />
          <SidebarLink
            to="/templates"
            label="Templates"
            collapsed={collapsed}
            icon={<TemplatesIcon />}
          />
          <SidebarLink
            to="/timer"
            label="Timer"
            collapsed={collapsed}
            icon={<TimerIcon />}
          />
          <SidebarLink
            to="/habits/today"
            label="Habits"
            collapsed={collapsed}
            icon={<HabitsIcon />}
          />
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t border-border/60 px-3 py-3">
          {!collapsed && (
            <div className="flex justify-start">
              <ThemeToggle />
            </div>
          )}

          {user ? (
            <div className="flex flex-col gap-2">
              {!collapsed && (
                <span
                  className="max-w-full truncate rounded-md bg-surface2 px-2 py-1 text-[11px] font-medium text-muted ring-1 ring-inset ring-border"
                  title={user.email ?? ''}
                >
                  {user.email}
                </span>
              )}
              <button
                onClick={signOut}
                title="Sign out"
                aria-label="Sign out"
                className={`btn-ghost !px-2.5 !py-1.5 ${
                  collapsed ? 'justify-center' : 'justify-start'
                }`}
              >
                <SignOutIcon />
                {!collapsed && <span>Sign out</span>}
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <main
        className={`min-h-screen transition-[padding] duration-200 ${mainLeftPadClass} ${mainRightPadClass}`}
      >
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <Outlet />
        </div>
      </main>

      <aside
        aria-label="Pace Cards"
        className={`fixed inset-y-0 right-0 z-40 hidden border-l border-border/70 bg-bg/85 backdrop-blur-xl supports-[backdrop-filter]:bg-bg/65 transition-[width] duration-200 ease-out md:flex md:flex-col ${rightWidthClass}`}
      >
        <div
          className={`flex items-center border-b border-border/60 px-2 py-2 ${
            rightCollapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          {!rightCollapsed && (
            <span className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Pace Cards
            </span>
          )}
          <button
            type="button"
            onClick={() => setRightCollapsed((value) => !value)}
            aria-label={rightCollapsed ? 'Expand pace cards' : 'Collapse pace cards'}
            title={rightCollapsed ? 'Expand pace cards' : 'Collapse pace cards'}
            className="btn-ghost !px-2 !py-1.5"
          >
            <RightChevronIcon collapsed={rightCollapsed} />
          </button>
        </div>

        {rightCollapsed ? (
          <div className="flex flex-1 items-start justify-center p-2">
            <span
              className="rounded-md bg-surface2 px-1.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted"
              title="Pace Cards"
            >
              Pace
            </span>
          </div>
        ) : (
          <RightPaceSidebar />
        )}
      </aside>
    </div>
  );
}

function SidebarLink({
  to,
  label,
  icon,
  collapsed,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={to}
      end
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors ${
          collapsed ? 'justify-center' : ''
        } ${
          isActive
            ? 'bg-surface2 text-fg ring-1 ring-inset ring-border'
            : 'text-muted hover:bg-surface2/60 hover:text-fg'
        }`
      }
    >
      <span className="shrink-0 text-current">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {collapsed ? <path d="m9 6 6 6-6 6" /> : <path d="m15 6-6 6 6 6" />}
    </svg>
  );
}

function RightChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {collapsed ? <path d="m15 6-6 6 6 6" /> : <path d="m9 6 6 6-6 6" />}
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

function ProjectsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function TimerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="13" r="8" />
      <path d="M12 13V9" />
      <path d="M12 13l3 2" />
      <path d="M9 3h6" />
      <path d="M15 6l1.5-1.5" />
    </svg>
  );
}

function TemplatesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 4h16v4H4z" />
      <path d="M4 10h16v10H4z" />
      <path d="M8 14h8" />
      <path d="M8 18h5" />
    </svg>
  );
}

function HabitsIcon() {
  return (
    <svg
      viewBox="0 0 14 14"
      width="16"
      height="16"
      fill="none"
      aria-hidden
    >
      <path
        d="M2 11l3-3 2.5 2.5L12 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="5" cy="8" r="0.8" fill="currentColor" />
      <circle cx="7.5" cy="10.5" r="0.8" fill="currentColor" />
      <circle cx="12" cy="5" r="0.8" fill="currentColor" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 17l5-5-5-5" />
      <path d="M20 12H9" />
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    </svg>
  );
}
