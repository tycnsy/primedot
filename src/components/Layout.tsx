import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PaceWidgetSync from './PaceWidgetSync';
import ThemeToggle from './ThemeToggle';
import RightPaceSidebar from './RightPaceSidebar';
import RightPinnedWhiteboards from './RightPinnedWhiteboards';
import { useHiddenPaceCards } from '../hooks/useHiddenPaceCards';
import { useNavPreferences } from '../hooks/useNavPreferences';
import { useOverdueTodoCount } from '../hooks/useTodos';

const LEFT_STORAGE_KEY = 'prime:sidebar-collapsed';
const RIGHT_STORAGE_KEY = 'prime:right-sidebar-collapsed';

type NavItemConfig = {
  id: string;
  to: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
};

export default function Layout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const { isHideMode, toggleHideMode } = useHiddenPaceCards();
  const overdueTodoCount = useOverdueTodoCount();

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
  const [isEditMode, setIsEditMode] = useState(false);
  const [draggedNavId, setDraggedNavId] = useState<string | null>(null);
  const [dropNavId, setDropNavId] = useState<string | null>(null);

  const navItems = useMemo<NavItemConfig[]>(
    () => [
      { id: 'projects', to: '/projects', label: 'Projects', icon: <ProjectsIcon /> },
      { id: 'pace', to: '/projects/pace', label: 'Pace Grid', icon: <PaceGridIcon /> },
      { id: 'heatmap', to: '/heatmap', label: 'Heatmap', icon: <HeatmapIcon /> },
      { id: 'templates', to: '/templates', label: 'Templates', icon: <TemplatesIcon /> },
      { id: 'calendar', to: '/calendar', label: 'Calendar', icon: <CalendarIcon /> },
      {
        id: 'todos',
        to: '/todos',
        label: 'To-Do',
        icon: <TodoIcon />,
        badge: overdueTodoCount,
      },
      { id: 'timer', to: '/timer', label: 'Timer', icon: <TimerIcon /> },
      { id: 'habits', to: '/habits/today', label: 'Habits', icon: <HabitsIcon /> },
      { id: 'goals', to: '/goals', label: 'Goals', icon: <GoalsIcon /> },
      { id: 'budget', to: '/budget', label: 'Money', icon: <MoneyIcon /> },
      { id: 'whiteboards', to: '/whiteboards', label: 'Whiteboard', icon: <WhiteboardIcon /> },
      {
        id: 'integrations',
        to: '/settings/integrations',
        label: 'Integrations',
        icon: <IntegrationsIcon />,
      },
      { id: 'pace-settings', to: '/settings/pace', label: 'Pace', icon: <PaceSettingsIcon /> },
      { id: 'tags', to: '/settings/tags', label: 'Tags', icon: <TagIcon /> },
      { id: 'series', to: '/settings/series', label: 'Series', icon: <SeriesIcon /> },
    ],
    [overdueTodoCount],
  );
  const availableNavIds = useMemo(() => navItems.map((item) => item.id), [navItems]);
  const navItemById = useMemo(
    () => new Map(navItems.map((item) => [item.id, item])),
    [navItems],
  );
  const {
    visibleIds,
    hiddenOrderedIds,
    isLoading: navPrefsLoading,
    reorder,
    toggleHidden,
  } = useNavPreferences(availableNavIds);
  const visibleItems = useMemo(
    () =>
      visibleIds
        .map((id) => navItemById.get(id))
        .filter((item): item is NavItemConfig => !!item),
    [navItemById, visibleIds],
  );
  const hiddenItems = useMemo(
    () =>
      hiddenOrderedIds
        .map((id) => navItemById.get(id))
        .filter((item): item is NavItemConfig => !!item),
    [hiddenOrderedIds, navItemById],
  );

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

  useEffect(() => {
    if (collapsed && isEditMode) {
      setIsEditMode(false);
    }
  }, [collapsed, isEditMode]);

  const widthClass = collapsed ? 'w-16' : 'w-60';
  const rightWidthClass = rightCollapsed ? 'w-12' : 'w-64';
  const mainLeftPadClass = collapsed ? 'md:pl-16' : 'md:pl-60';
  const mainRightPadClass = rightCollapsed ? 'md:pr-12' : 'md:pr-64';
  // The whiteboard route fills the viewport — drop Layout's centered max-width
  // and vertical padding so the canvas can bleed edge-to-edge.
  const isFullBleed = /^\/whiteboards\/[^/]+$/.test(location.pathname);
  const isTimerWide =
    location.pathname === '/timer' ||
    /^\/projects\/[^/]+\/timer$/.test(location.pathname);
  const isCalendarWide = location.pathname === '/calendar';
  const isProjectsWide = location.pathname === '/projects';
  const contentClass = isFullBleed
    ? 'h-full w-full'
    : isTimerWide || isCalendarWide || isProjectsWide
      ? 'w-full px-4 py-8 sm:px-6'
      : 'mx-auto max-w-5xl px-4 py-8 sm:px-6';

  const handleDropOnVisible = async (targetId: string) => {
    if (!draggedNavId || draggedNavId === targetId) {
      setDropNavId(null);
      return;
    }
    try {
      await reorder(draggedNavId, targetId);
    } finally {
      setDraggedNavId(null);
      setDropNavId(null);
    }
  };

  return (
    <div className="relative min-h-screen">
      <PaceWidgetSync />

      {/* Mobile top bar (hidden on md+) */}
      <header
        className="sticky top-0 z-30 flex items-center gap-2 border-b border-border/70 bg-bg/70 backdrop-blur-xl supports-[backdrop-filter]:bg-bg/55 md:hidden"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
          paddingRight: 'calc(env(safe-area-inset-right, 0px) + 1rem)',
          paddingBottom: '0.75rem',
          paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 1rem)',
        }}
      >
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
        <Link
          to="/projects/pace"
          className="btn-ghost ml-auto !px-2.5 !py-1.5 text-xs font-semibold uppercase tracking-wide"
        >
          Pace Grid
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
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
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

        <nav className="flex flex-1 min-h-0 flex-col px-2 text-sm" aria-label="Sections">
          {isEditMode && !collapsed ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
              <div className="flex flex-col gap-1">
                <h3 className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Visible
                </h3>
                {visibleItems.map((item) => (
                  <EditableNavRow
                    key={item.id}
                    item={item}
                    isHidden={false}
                    isDragging={draggedNavId === item.id}
                    isDropTarget={dropNavId === item.id}
                    draggable={!navPrefsLoading}
                    onDragStart={(id) => setDraggedNavId(id)}
                    onDragOver={(id) => setDropNavId(id)}
                    onDrop={handleDropOnVisible}
                    onDragEnd={() => {
                      setDraggedNavId(null);
                      setDropNavId(null);
                    }}
                    onToggleHidden={toggleHidden}
                    disabled={navPrefsLoading}
                  />
                ))}
                {visibleItems.length === 0 && (
                  <p className="rounded-md bg-surface2 px-2.5 py-2 text-xs text-muted">
                    No visible links.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <h3 className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Hidden
                </h3>
                {hiddenItems.map((item) => (
                  <EditableNavRow
                    key={item.id}
                    item={item}
                    isHidden={true}
                    isDragging={false}
                    isDropTarget={false}
                    draggable={false}
                    onDragStart={() => undefined}
                    onDragOver={() => undefined}
                    onDrop={() => undefined}
                    onDragEnd={() => undefined}
                    onToggleHidden={toggleHidden}
                    disabled={navPrefsLoading}
                  />
                ))}
                {hiddenItems.length === 0 && (
                  <p className="rounded-md bg-surface2 px-2.5 py-2 text-xs text-muted">
                    No hidden links.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-0.5">
              {visibleItems.map((item) => (
                <SidebarLink
                  key={item.id}
                  to={item.to}
                  label={item.label}
                  collapsed={collapsed}
                  icon={item.icon}
                  badge={item.badge}
                />
              ))}
            </div>
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t border-border/60 px-3 py-3">
          {!collapsed && (
            <button
              type="button"
              onClick={() => {
                setIsEditMode((value) => !value);
                setDraggedNavId(null);
                setDropNavId(null);
              }}
              className={
                isEditMode
                  ? 'btn-secondary w-full !px-2.5 !py-1.5'
                  : 'btn-ghost w-full !px-2.5 !py-1.5'
              }
            >
              {isEditMode ? <DoneIcon /> : <EditIcon />}
              <span>{isEditMode ? 'Done' : 'Edit links'}</span>
            </button>
          )}

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
        <div className={contentClass}>
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
            <Link
              to="/projects/pace?tab=table"
              className="rounded px-1 text-xs font-semibold uppercase tracking-wide text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Pace Cards
            </Link>
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
          <div className="flex min-h-0 flex-1 flex-col">
            <RightPaceSidebar isHideMode={isHideMode} />
            <div className="border-t border-border/60 p-2">
              <button
                type="button"
                onClick={toggleHideMode}
                className={isHideMode ? 'btn-secondary w-full' : 'btn-ghost w-full'}
              >
                {isHideMode ? 'Confirm hidden cards' : 'Hide cards'}
              </button>
            </div>
            <RightPinnedWhiteboards />
          </div>
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
  badge,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  collapsed: boolean;
  badge?: number;
}) {
  const showBadge = typeof badge === 'number' && badge > 0;
  const badgeText = showBadge ? (badge > 99 ? '99+' : String(badge)) : '';
  return (
    <NavLink
      to={to}
      end
      title={collapsed ? label : undefined}
      aria-label={
        collapsed
          ? showBadge
            ? `${label}, ${badge} overdue`
            : label
          : undefined
      }
      className={({ isActive }) =>
        `relative flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors ${
          collapsed ? 'justify-center' : ''
        } ${
          isActive
            ? 'bg-surface2 text-fg ring-1 ring-inset ring-border'
            : 'text-muted hover:bg-surface2/60 hover:text-fg'
        }`
      }
    >
      <span className="relative shrink-0 text-current">
        {icon}
        {showBadge && collapsed && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-semibold leading-none text-white">
            {badgeText}
          </span>
        )}
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
      {showBadge && !collapsed && (
        <span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-semibold leading-none text-white">
          {badgeText}
        </span>
      )}
    </NavLink>
  );
}

function EditableNavRow({
  item,
  isHidden,
  isDragging,
  isDropTarget,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onToggleHidden,
  disabled,
}: {
  item: NavItemConfig;
  isHidden: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  draggable: boolean;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: (id: string) => void | Promise<void>;
  onDragEnd: () => void;
  onToggleHidden: (id: string) => Promise<void>;
  disabled: boolean;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={() => onDragStart(item.id)}
      onDragOver={(event) => {
        if (!draggable) return;
        event.preventDefault();
        onDragOver(item.id);
      }}
      onDrop={(event) => {
        if (!draggable) return;
        event.preventDefault();
        void onDrop(item.id);
      }}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 rounded-md px-2 py-2 transition-colors ${
        isDropTarget ? 'bg-surface2 ring-1 ring-inset ring-border' : 'hover:bg-surface2/60'
      } ${isDragging ? 'opacity-50' : ''} ${draggable ? 'cursor-grab' : ''}`}
    >
      {isHidden ? (
        <Link
          to={item.to}
          className="btn-ghost !px-1.5 !py-1 text-muted"
          aria-label={`Open ${item.label}`}
          title={`Open ${item.label}`}
        >
          <OpenLinkIcon />
        </Link>
      ) : (
        <span className={`text-muted ${draggable ? '' : 'opacity-40'}`}>
          <DragHandleIcon />
        </span>
      )}
      <span className="shrink-0 text-current">{item.icon}</span>
      <span className="truncate">{item.label}</span>
      <button
        type="button"
        aria-label={isHidden ? `Show ${item.label}` : `Hide ${item.label}`}
        title={isHidden ? 'Show link' : 'Hide link'}
        className="btn-ghost ml-auto !px-1.5 !py-1"
        onClick={() => {
          void onToggleHidden(item.id);
        }}
        disabled={disabled}
      >
        {isHidden ? <EyeClosedIcon /> : <EyeOpenIcon />}
      </button>
    </div>
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

function EditIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L8 20l-5 1 1-5Z" />
    </svg>
  );
}

function DoneIcon() {
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
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01" />
    </svg>
  );
}

function OpenLinkIcon() {
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
      <path d="M14 4h6v6" />
      <path d="M10 14 20 4" />
      <path d="M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

function EyeOpenIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

function EyeClosedIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 6.3A11.8 11.8 0 0 1 12 6c6.5 0 10 6 10 6a18.8 18.8 0 0 1-4 4.7" />
      <path d="M6.7 6.8C3.8 8.5 2 12 2 12s3.5 6 10 6c1.3 0 2.5-.2 3.7-.6" />
      <path d="M9.8 9.8a3 3 0 0 0 4.2 4.2" />
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

function PaceGridIcon() {
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
      <rect x="3" y="4" width="18" height="16" rx="1.8" />
      <path d="M3 10h18" />
      <path d="M3 16h18" />
      <path d="M9 4v16" />
      <path d="M15 4v16" />
    </svg>
  );
}

function HeatmapIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden
    >
      <rect x="3" y="3" width="4" height="4" rx="0.8" opacity="0.35" />
      <rect x="9" y="3" width="4" height="4" rx="0.8" opacity="0.55" />
      <rect x="15" y="3" width="4" height="4" rx="0.8" opacity="0.85" />
      <rect x="3" y="9" width="4" height="4" rx="0.8" opacity="0.55" />
      <rect x="9" y="9" width="4" height="4" rx="0.8" opacity="0.85" />
      <rect x="15" y="9" width="4" height="4" rx="0.8" opacity="0.35" />
      <rect x="3" y="15" width="4" height="4" rx="0.8" opacity="0.85" />
      <rect x="9" y="15" width="4" height="4" rx="0.8" opacity="0.35" />
      <rect x="15" y="15" width="4" height="4" rx="0.8" opacity="0.55" />
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

function CalendarIcon() {
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
      <rect x="3" y="5" width="18" height="16" rx="1.8" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M3 10h18" />
      <path d="M8 14h3" />
      <path d="M13 14h3" />
      <path d="M8 18h3" />
    </svg>
  );
}

function TodoIcon() {
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
      <path d="m3 7 2 2 3-3" />
      <path d="m3 17 2 2 3-3" />
      <path d="M12 8h9" />
      <path d="M12 18h9" />
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

function GoalsIcon() {
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
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M20 4l-5.5 5.5" />
    </svg>
  );
}

function MoneyIcon() {
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
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9.5v5" />
      <path d="M18 9.5v5" />
    </svg>
  );
}

function WhiteboardIcon() {
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
      <rect x="3" y="4" width="18" height="13" rx="1.5" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M8 10l2 2 4-4" />
    </svg>
  );
}

function IntegrationsIcon() {
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
      <path d="M10 13a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.5 1.5" />
      <path d="M14 11a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.5-1.5" />
    </svg>
  );
}

function PaceSettingsIcon() {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function TagIcon() {
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
      <path d="M20 10.5 13.5 4H5v8.5L11.5 19a2 2 0 0 0 2.8 0l5.7-5.7a2 2 0 0 0 0-2.8Z" />
      <circle cx="8.5" cy="8.5" r="1" />
    </svg>
  );
}

function SeriesIcon() {
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
      <path d="M4 7h11" />
      <path d="M4 12h16" />
      <path d="M4 17h9" />
      <circle cx="18" cy="7" r="2" />
      <circle cx="15" cy="17" r="2" />
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
