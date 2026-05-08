import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GoalTypeBadge, TagChip } from '../components/goals';
import WeekStrip from '../components/habits/WeekStrip';
import { useGoalsStore } from '../features/goals';
import type { DayState } from '../features/habits/types';

function isDone(
  goal: { kind: 'check' | 'count'; target?: number },
  entry: { done?: boolean; count?: number } | undefined,
) {
  if (!entry) return false;
  if (goal.kind === 'count') return (entry.count ?? 0) >= (goal.target ?? 1);
  return entry.done === true;
}

function scheduleLabel(schedule: 'daily' | 'weekly') {
  return schedule === 'weekly' ? 'Weekly' : 'Daily';
}

export default function GoalDetailDaily() {
  const navigate = useNavigate();
  const { goalId } = useParams<{ goalId: string }>();
  const {
    dailyGoals,
    longGoals,
    tags,
    todayEntries,
    weekHist,
    streaks,
    toggleDailyCheck,
    setDailyCount,
    archiveDailyGoal,
  } = useGoalsStore();
  const goal = dailyGoals.find((item) => item.id === goalId);
  const linkedGoal = goal?.linkedTo ? longGoals.find((item) => item.id === goal.linkedTo) : null;
  const primaryTag = goal?.tags[0] ? tags.find((tag) => tag.id === goal.tags[0]) : null;
  const entry = goal ? todayEntries[goal.id] : undefined;
  const done = goal ? isDone(goal, entry) : false;
  const weekData: DayState[] = useMemo(() => {
    const hist = goal ? weekHist[goal.id] ?? [] : [];
    const mapped = hist.map((state) => state as DayState);
    if (mapped.length >= 7) return mapped.slice(0, 7);
    return [...Array.from({ length: Math.max(0, 7 - mapped.length) }, () => 'idle' as const), ...mapped];
  }, [goal, weekHist]);

  if (!goal) {
    return (
      <div className="space-y-3">
        <Link
          to="/goals"
          className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
        >
          <span aria-hidden>←</span> Goals
        </Link>
        <p className="text-sm text-muted">Daily goal not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            to="/goals"
            className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
          >
            <span aria-hidden>←</span> Goals
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <GoalTypeBadge type={goal.schedule === 'weekly' ? 'weekly' : 'daily'} />
            {primaryTag ? <TagChip tag={primaryTag} /> : null}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">{goal.name}</h1>
          <p className="text-sm text-muted">
            {goal.kind === 'count'
              ? `Count · target ${goal.target ?? 1} ${goal.unit ?? ''}`.trim()
              : 'Check'}
            {' · '}
            {scheduleLabel(goal.schedule)}
            {goal.timeOfDay && goal.timeOfDay !== 'anytime' ? ` · ${goal.timeOfDay}` : ''}
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost"
          onClick={async () => {
            const confirmed = window.confirm(`Archive "${goal.name}"?`);
            if (!confirmed) return;
            await archiveDailyGoal(goal.id);
            navigate('/goals');
          }}
        >
          Archive
        </button>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">Last 7 days</p>
          <div className="mt-2">
            <WeekStrip data={weekData} todayIdx={6} size={16} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${streaks[goal.id] > 0 ? 'text-accent' : 'text-muted'}`}>
            🔥 {streaks[goal.id] ?? 0} day streak
          </span>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (goal.kind === 'check') {
                toggleDailyCheck(goal.id);
                return;
              }
              setDailyCount(goal.id, (entry?.count ?? 0) + 1);
            }}
          >
            {goal.kind === 'check'
              ? done
                ? 'Mark pending'
                : 'Mark done'
              : `Log +1 (${entry?.count ?? 0}/${goal.target ?? 1})`}
          </button>
        </div>
      </div>

      {linkedGoal ? (
        <button
          type="button"
          className="card flex w-full items-center justify-between gap-3 text-left transition hover:border-border hover:shadow-sm"
          onClick={() => navigate(`/goals/long/${linkedGoal.id}`)}
        >
          <div className="min-w-0">
            <p className="label">Linked long-term goal</p>
            <p className="truncate text-base font-semibold text-fg">{linkedGoal.name}</p>
            <p className="text-xs text-muted">
              Navigation shortcut only - no shared progress data.
            </p>
          </div>
          <span className="text-sm text-muted">→</span>
        </button>
      ) : null}

      {goal.notes ? (
        <div className="card">
          <p className="label mb-2">Notes</p>
          <p className="text-sm text-muted">{goal.notes}</p>
        </div>
      ) : null}
    </div>
  );
}
