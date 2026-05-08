import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoalCard, GoalsSubnav, LogProgressModal, NewGoalModal } from '../components/goals';
import { useGoalsPreferences, useGoalsStore } from '../features/goals';
import type { LongGoal, Tag } from '../features/goals';

type GoalsTab = 'all' | 'trend' | 'accumulation' | 'milestone' | 'daily';

function isTypingContext(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

function isDailyGoalDone(
  goal: { kind: 'check' | 'count'; target?: number },
  entry: { done?: boolean; count?: number } | undefined,
): boolean {
  if (!entry) return false;
  if (goal.kind === 'count') return (entry.count ?? 0) >= (goal.target ?? 1);
  return entry.done === true;
}

export default function GoalsIndex() {
  const navigate = useNavigate();
  const { longGoals, dailyGoals, tags, todayEntries, addLog, addLongGoal } = useGoalsStore();
  const {
    density,
    setDensity,
    indexLayout,
    setIndexLayout,
    showPaceLine,
    setShowPaceLine,
  } = useGoalsPreferences();
  const [activeTab, setActiveTab] = useState<GoalsTab>('all');
  const [search, setSearch] = useState('');
  const [activeTagId, setActiveTagId] = useState<string | 'all'>('all');
  const [isNewGoalModalOpen, setIsNewGoalModalOpen] = useState(false);
  const [logGoal, setLogGoal] = useState<LongGoal | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'n' && !isTypingContext(event.target)) {
        event.preventDefault();
        setIsNewGoalModalOpen(true);
        return;
      }
      if (event.key !== '/' || isTypingContext(event.target)) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const query = search.trim().toLowerCase();

  const filteredLongGoals = useMemo(() => {
    const visible = longGoals.filter((goal) => !goal.archivedAt);
    return visible.filter((goal) => {
      if (activeTab !== 'all' && activeTab !== goal.type) return false;
      if (activeTagId !== 'all' && !goal.tags.includes(activeTagId)) return false;
      if (!query) return true;
      const haystack = `${goal.name} ${goal.description ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [activeTab, activeTagId, longGoals, query]);

  const filteredDailyGoals = useMemo(() => {
    const visible = dailyGoals.filter((goal) => !goal.archivedAt);
    return visible.filter((goal) => {
      if (activeTab !== 'all' && activeTab !== 'daily') return false;
      if (activeTagId !== 'all' && !goal.tags.includes(activeTagId)) return false;
      if (!query) return true;
      const haystack = `${goal.name} ${goal.notes ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [activeTab, activeTagId, dailyGoals, query]);

  const visibleTags = useMemo(() => {
    const usedTagIds = new Set<string>();
    longGoals.forEach((goal) => goal.tags.forEach((tagId) => usedTagIds.add(tagId)));
    dailyGoals.forEach((goal) => goal.tags.forEach((tagId) => usedTagIds.add(tagId)));
    return tags.filter((tag) => usedTagIds.has(tag.id));
  }, [dailyGoals, longGoals, tags]);
  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);

  const dailyDoneCount = useMemo(
    () =>
      dailyGoals.filter(
        (goal) => !goal.archivedAt && isDailyGoalDone(goal, todayEntries[goal.id]),
      ).length,
    [dailyGoals, todayEntries],
  );

  const activeDailyCount = dailyGoals.filter((goal) => !goal.archivedAt).length;
  const upNext = dailyGoals
    .filter((goal) => !goal.archivedAt && !isDailyGoalDone(goal, todayEntries[goal.id]))
    .slice(0, 3)
    .map((goal) => goal.name);
  const hasNoFilterMatches =
    filteredLongGoals.length === 0 && filteredDailyGoals.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Link
            to="/projects"
            className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
          >
            <span aria-hidden>←</span> Home
          </Link>
          <p className="label tracking-[0.08em]">PERSONAL</p>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">Goals</h1>
          <p className="text-sm text-muted">
            {longGoals.filter((goal) => !goal.archivedAt).length} long-term ·{' '}
            {activeDailyCount} recurring ·{' '}
            {new Intl.DateTimeFormat('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            }).format(new Date())}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/goals/today" className="btn-ghost">
            Today view
          </Link>
          <button type="button" className="btn-primary" onClick={() => setIsNewGoalModalOpen(true)}>
            + New goal
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="segmented">
          {(
            ['all', 'trend', 'accumulation', 'milestone', 'daily'] as GoalsTab[]
          ).map((tab) => (
            <button
              key={tab}
              type="button"
              data-active={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div className="relative">
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted"
            aria-hidden
          >
            🔍
          </span>
          <input
            ref={searchInputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search goals…"
            className="input w-[220px] pl-8"
            aria-label="Search goals"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface2/50 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted">Density</span>
          <div className="segmented">
            {(['cozy', 'comfortable', 'compact'] as const).map((item) => (
              <button
                key={item}
                type="button"
                data-active={density === item}
                className="capitalize"
                onClick={() => setDensity(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted">Index layout</span>
          <div className="segmented">
            {(['grid', 'list'] as const).map((item) => (
              <button
                key={item}
                type="button"
                data-active={indexLayout === item}
                className="capitalize"
                onClick={() => setIndexLayout(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              showPaceLine
                ? 'border-border bg-surface text-fg'
                : 'border-border/70 text-muted hover:text-fg'
            }`}
            onClick={() => setShowPaceLine(!showPaceLine)}
          >
            Pace line: {showPaceLine ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTagId('all')}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTagId === 'all'
              ? 'border-border bg-surface2 text-fg'
              : 'border-border/70 text-muted hover:text-fg'
          }`}
        >
          All tags
        </button>
        {visibleTags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            onClick={() => setActiveTagId(tag.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTagId === tag.id
                ? 'border-border bg-surface2 text-fg'
                : 'border-border/70 text-muted hover:text-fg'
            }`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: tag.color }}
              aria-hidden
            />
            {tag.name}
          </button>
        ))}
      </div>

      {(activeTab === 'all' || activeTab === 'daily') && (
        <Link to="/goals/today" className="card block transition hover:border-border hover:shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="label">TODAY</p>
              <h2 className="mt-1 text-lg font-semibold text-fg">
                {dailyDoneCount} of {activeDailyCount} daily goals done
              </h2>
              <p className="text-sm text-muted">
                {upNext.length > 0
                  ? `Up next: ${upNext.join(' · ')}`
                  : 'All daily goals checked. Nice.'}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xl font-semibold tabular-nums text-fg">
                {activeDailyCount > 0
                  ? Math.round((dailyDoneCount / activeDailyCount) * 100)
                  : 0}
                %
              </span>
              <p className="text-xs text-muted">today</p>
            </div>
          </div>
        </Link>
      )}

      {(activeTab === 'all' || activeTab === 'daily') && (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <p className="label">Recurring goals</p>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-3">
            {filteredDailyGoals.map((goal) => (
              <Link
                key={goal.id}
                to={`/goals/daily/${goal.id}`}
                className="card block transition hover:border-border hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-fg">{goal.name}</p>
                    <p className="text-xs text-muted">
                      {goal.schedule} · {goal.kind}
                      {goal.kind === 'count'
                        ? ` · ${(todayEntries[goal.id]?.count ?? 0)}/${goal.target ?? 1} ${goal.unit ?? ''}`.trim()
                        : ''}
                    </p>
                  </div>
                  <span className="text-xs text-muted">
                    {isDailyGoalDone(goal, todayEntries[goal.id]) ? 'Done' : 'Pending'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(activeTab === 'all' || activeTab !== 'daily') && (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <p className="label">Long-term goals</p>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div
            className={
              indexLayout === 'grid'
                ? 'grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3.5'
                : 'grid gap-3'
            }
          >
            {filteredLongGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                tags={goal.tags
                  .map((id) => tagById.get(id))
                  .filter((tag): tag is Tag => !!tag)}
                onOpen={() => navigate(`/goals/long/${goal.id}`)}
                onLog={() => setLogGoal(goal)}
                showPaceLine={showPaceLine}
              />
            ))}
          </div>
        </section>
      )}

      {hasNoFilterMatches && (
        <div className="card">
          <p className="text-sm text-muted">No goals match. Try clearing filters.</p>
        </div>
      )}

      <div className="pt-1">
        <GoalsSubnav />
      </div>

      <LogProgressModal
        open={!!logGoal}
        goal={logGoal}
        onClose={() => setLogGoal(null)}
        onSave={({ goalId, value, note, at }) => {
          addLog(goalId, { value, note, at });
        }}
      />
      <NewGoalModal
        open={isNewGoalModalOpen}
        tags={tags}
        onClose={() => setIsNewGoalModalOpen(false)}
        onCreate={(goal) => {
          const id = addLongGoal(goal);
          navigate(`/goals/long/${id}`);
        }}
      />
    </div>
  );
}
