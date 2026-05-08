import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoalRow, GoalsSubnav } from '../components/goals';
import RingProgress from '../components/habits/RingProgress';
import { useGoalsStore } from '../features/goals';
import type { DailyGoal, TimeOfDay } from '../features/goals';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function isTypingContext(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

function isDailyGoalDone(goal: DailyGoal, entry: { done?: boolean; count?: number } | undefined): boolean {
  if (!entry) return false;
  if (goal.kind === 'count') return (entry.count ?? 0) >= (goal.target ?? 1);
  return entry.done === true;
}

function sectionLabel(timeOfDay: TimeOfDay): string {
  if (timeOfDay === 'morning') return 'Morning';
  if (timeOfDay === 'evening') return 'Evening';
  return 'During the day';
}

function sectionRange(timeOfDay: TimeOfDay): string {
  if (timeOfDay === 'morning') return '06-11';
  if (timeOfDay === 'evening') return '20-23';
  return 'Anytime';
}

export default function GoalsToday() {
  const navigate = useNavigate();
  const {
    dailyGoals,
    longGoals,
    tags,
    todayEntries,
    streaks,
    toggleDailyCheck,
    setDailyCount,
    addDailyGoal,
  } = useGoalsStore();
  const [search, setSearch] = useState('');
  const [focusIndex, setFocusIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeDailyGoals = dailyGoals.filter((goal) => !goal.archivedAt);
  const query = search.trim().toLowerCase();
  const visibleGoals = useMemo(
    () =>
      activeDailyGoals.filter((goal) =>
        query.length > 0
          ? `${goal.name} ${goal.notes ?? ''}`.toLowerCase().includes(query)
          : true,
      ),
    [activeDailyGoals, query],
  );

  const doneCount = visibleGoals.filter((goal) => isDailyGoalDone(goal, todayEntries[goal.id])).length;
  const percent = visibleGoals.length > 0 ? (doneCount / visibleGoals.length) * 100 : 0;

  const sectionOrder: TimeOfDay[] = ['morning', 'anytime', 'evening'];
  const goalsBySection = useMemo(() => {
    return sectionOrder.map((timeOfDay) => ({
      timeOfDay,
      goals: visibleGoals.filter((goal) => (goal.timeOfDay ?? 'anytime') === timeOfDay),
    }));
  }, [visibleGoals]);

  const focusableGoals = useMemo(
    () => goalsBySection.flatMap((section) => section.goals),
    [goalsBySection],
  );

  useEffect(() => {
    setFocusIndex((current) =>
      Math.min(Math.max(current, 0), Math.max(focusableGoals.length - 1, 0)),
    );
  }, [focusableGoals.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/' && !isTypingContext(event.target)) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (event.key.toLowerCase() === 'n' && !isTypingContext(event.target)) {
        event.preventDefault();
        const name = window.prompt('Quick-add goal name');
        if (!name?.trim()) return;
        addDailyGoal({
          name: name.trim(),
          kind: 'check',
          schedule: 'daily',
          timeOfDay: 'anytime',
          tags: [],
        });
        return;
      }

      if (event.key === 'ArrowDown' && !isTypingContext(event.target)) {
        event.preventDefault();
        setFocusIndex((idx) => Math.min(idx + 1, Math.max(focusableGoals.length - 1, 0)));
        return;
      }

      if (event.key === 'ArrowUp' && !isTypingContext(event.target)) {
        event.preventDefault();
        setFocusIndex((idx) => Math.max(idx - 1, 0));
        return;
      }

      if (event.key === ' ' && !isTypingContext(event.target) && focusableGoals.length > 0) {
        event.preventDefault();
        const goal = focusableGoals[focusIndex];
        if (!goal) return;
        if (goal.kind === 'check') {
          toggleDailyCheck(goal.id);
        } else {
          const next = (todayEntries[goal.id]?.count ?? 0) + 1;
          setDailyCount(goal.id, next);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    addDailyGoal,
    focusIndex,
    focusableGoals,
    setDailyCount,
    todayEntries,
    toggleDailyCheck,
  ]);

  const longGoalNameById = useMemo(
    () => new Map(longGoals.map((goal) => [goal.id, goal.name])),
    [longGoals],
  );
  const tagNameById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag.name])), [tags]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            to="/goals"
            className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
          >
            <span aria-hidden>←</span> Goals
          </Link>
          <p className="label">
            {new Intl.DateTimeFormat('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })
              .format(new Date())
              .toUpperCase()}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">Good {getGreeting()}.</h1>
          <p className="text-sm text-muted">
            {doneCount} of {visibleGoals.length} daily goals checked off · keep going
          </p>
        </div>
        <div className="pt-2">
          <RingProgress percent={percent} size={64} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <GoalsSubnav />
        <div className="segmented">
          <button type="button" data-active>
            Today
          </button>
          <button type="button">Week</button>
          <button type="button">Month</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          ref={searchInputRef}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search daily goals…"
          className="input max-w-sm"
          aria-label="Search daily goals"
        />
        <p className="text-xs text-muted">N quick-add · Space toggle · / search · ↑/↓ focus</p>
      </div>

      {goalsBySection
        .filter((section) => section.goals.length > 0)
        .map((section) => {
          const sectionDone = section.goals.filter((goal) =>
            isDailyGoalDone(goal, todayEntries[goal.id]),
          ).length;
          return (
            <section key={section.timeOfDay} className="card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-fg">
                  {sectionLabel(section.timeOfDay)}{' '}
                  <span className="text-xs font-normal text-muted">({sectionRange(section.timeOfDay)})</span>
                </h2>
                <span className="text-xs text-muted">
                  ({sectionDone}/{section.goals.length})
                </span>
              </div>
              <div className="space-y-2">
                {section.goals.map((goal) => {
                  const rowFocusIndex = focusableGoals.findIndex((item) => item.id === goal.id);
                  return (
                    <GoalRow
                      key={goal.id}
                      goal={goal}
                      entry={todayEntries[goal.id]}
                      streak={streaks[goal.id] ?? 0}
                      focused={rowFocusIndex === focusIndex}
                      linkedGoalName={
                        goal.linkedTo ? longGoalNameById.get(goal.linkedTo) : undefined
                      }
                      metaTagName={goal.tags[0] ? tagNameById.get(goal.tags[0]) : undefined}
                      onToggle={() => toggleDailyCheck(goal.id)}
                      onCount={(value) => setDailyCount(goal.id, value)}
                      onOpenDetail={() => navigate(`/goals/daily/${goal.id}`)}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}

      {visibleGoals.length === 0 ? (
        <div className="card text-center text-sm text-muted">
          No daily goals match. Try clearing search.
        </div>
      ) : null}

      <div className="flex justify-center">
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            const name = window.prompt('Quick-add goal name');
            if (!name?.trim()) return;
            addDailyGoal({
              name: name.trim(),
              kind: 'check',
              schedule: 'daily',
              timeOfDay: 'anytime',
              tags: [],
            });
          }}
        >
          Quick-add goal <span className="font-mono text-xs">N</span>
        </button>
      </div>
    </div>
  );
}
