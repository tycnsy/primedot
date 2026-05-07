import { Link, useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useEntries, useHabitDetail, useHabits } from '../hooks/useHabits';
import RingProgress from '../components/habits/RingProgress';

function levelFor(entry: {
  done?: boolean;
  count?: number;
  scale?: number;
  noteText?: string;
}): number {
  if (entry.done) return 4;
  if ((entry.scale ?? 0) > 0) return Math.min(4, entry.scale ?? 0);
  if ((entry.count ?? 0) > 0) return Math.min(4, entry.count ?? 0);
  if (entry.noteText?.trim()) return 2;
  return 0;
}

export default function HabitDetail() {
  const { habitId } = useParams();
  const { habit, entries, stats, log, isLoading, error } = useHabitDetail(habitId);
  const { archiveHabit } = useHabits();
  const today = new Date().toISOString().slice(0, 10);
  const { toggleCheck } = useEntries(today);
  const [activeTab, setActiveTab] = useState<'overview' | 'log' | 'notes' | 'settings'>(
    'overview',
  );

  const heatmapLevels = useMemo(() => {
    const entryByDate = new Map(entries.map((entry) => [entry.date, entry]));
    const cells: number[] = [];
    for (let d = 181; d >= 0; d -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      const key = date.toISOString().slice(0, 10);
      const entry = entryByDate.get(key);
      cells.push(entry ? levelFor(entry) : 0);
    }
    return cells;
  }, [entries]);

  if (isLoading) {
    return <p className="text-sm text-muted">Loading habit…</p>;
  }

  if (error || !habit) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-danger">
          {error instanceof Error ? error.message : 'Habit not found.'}
        </p>
        <Link to="/habits/today" className="btn-secondary">
          Back to habits
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Link
          to="/habits/today"
          className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
        >
          <span aria-hidden>←</span> Habits
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">{habit.name}</h1>
        <p className="text-sm text-muted">
          {habit.schedule.type} · Started{' '}
          {habit.createdAt
            ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
                new Date(habit.createdAt),
              )
            : 'recently'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost">
          Edit
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            void archiveHabit(habit.id);
          }}
        >
          Archive
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            if (habit.kind === 'check') void toggleCheck(habit.id);
          }}
          disabled={habit.kind !== 'check'}
          title={habit.kind === 'check' ? 'Mark done' : 'Inline mark done currently supports check habits'}
        >
          Mark done
        </button>
      </div>

      <div className="segmented">
        {(['overview', 'log', 'notes', 'settings'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            data-active={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          >
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="grid gap-3 sm:grid-cols-5">
          <Stat label="Current streak" value={String(stats.currentStreak)} accent />
          <Stat label="Longest streak" value={String(stats.longestStreak)} />
          <Stat label="This month" value={`${stats.thisMonth.done}/${stats.thisMonth.total}`} />
          <Stat label="Consistency" value={`${stats.consistency}%`} />
          <Stat label="Total sessions" value={String(stats.total)} />
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-fg">Last 6 months</h2>
          <RingProgress percent={stats.consistency} />
        </div>
        <div className="grid grid-cols-[repeat(26,minmax(0,1fr))] gap-1">
          {heatmapLevels.slice(-182).map((level, idx) => (
            <span
              key={idx}
              className={`h-2.5 rounded-sm ${
                level === 0
                  ? 'bg-surface2 ring-1 ring-inset ring-border/70'
                  : level === 1
                    ? 'bg-accent/30'
                    : level === 2
                      ? 'bg-accent/45'
                      : level === 3
                        ? 'bg-accent/70'
                        : 'bg-accent'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="card space-y-3">
          <h3 className="text-base font-semibold text-fg">Recent log</h3>
          {log().length === 0 ? (
            <p className="text-sm text-muted">No entries yet.</p>
          ) : (
            <ul className="space-y-2">
              {log()
                .slice(0, 12)
                .map((item) => (
                  <li
                    key={`${item.date}-${item.status}`}
                    className="flex items-center justify-between rounded-md bg-surface2 px-3 py-2 text-sm"
                  >
                    <span className="text-fg">{item.date}</span>
                    <span className="text-muted">{item.detail ?? item.status}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
        <div className="space-y-4">
          <div className="card space-y-2">
            <h3 className="text-base font-semibold text-fg">Goal</h3>
            <p className="text-2xl font-semibold text-fg">
              {stats.thisMonth.done} / {stats.thisMonth.total}
            </p>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width:
                    stats.thisMonth.total > 0
                      ? `${Math.round((stats.thisMonth.done / stats.thisMonth.total) * 100)}%`
                      : '0%',
                }}
              />
            </div>
          </div>
          <div className="card space-y-2">
            <h3 className="text-base font-semibold text-fg">Notes</h3>
            <p className="text-sm text-muted">
              {habit.notes?.trim() || 'No habit-level notes yet.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${accent ? 'text-accent' : 'text-fg'}`}>
        {value}
      </p>
    </div>
  );
}
