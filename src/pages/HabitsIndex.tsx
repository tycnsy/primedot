import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HabitRow, RingProgress } from '../components/habits';
import {
  buildLast7DayStates,
  rangeProgressForHabit,
} from '../features/habits/metrics';
import type { DayState } from '../features/habits/types';
import { useEntries, useEntriesRange, useHabits } from '../hooks/useHabits';

type RangeTab = 'today' | 'week' | 'month' | 'all';

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateString(date);
}

function firstDayOfMonth() {
  const date = new Date();
  date.setDate(1);
  return toDateString(date);
}

export default function HabitsIndex() {
  const navigate = useNavigate();
  const { habits, isLoading, error, reorderHabits } = useHabits();
  const today = new Date().toISOString().slice(0, 10);
  const [activeTab, setActiveTab] = useState<RangeTab>('today');
  const { entries: todayEntries, toggleCheck, setCount, setScale, setNote } = useEntries(today);

  const bounds = useMemo(() => {
    if (activeTab === 'today') return { from: today, to: today };
    if (activeTab === 'week') return { from: daysAgo(6), to: today };
    if (activeTab === 'month') return { from: firstDayOfMonth(), to: today };
    return { from: null, to: null };
  }, [activeTab, today]);

  const range = useEntriesRange(bounds.from, bounds.to);
  const history7 = useEntriesRange(daysAgo(6), today);

  const rangeEntriesByHabit = range.entriesByHabit;
  const historyByHabit = history7.entriesByHabit;

  const progress = useMemo(() => {
    let scheduled = 0;
    let completed = 0;
    const to = bounds.to ?? today;
    habits.forEach((habit) => {
      const from = bounds.from ?? habit.createdAt?.slice(0, 10) ?? today;
      const entriesForHabit = rangeEntriesByHabit[habit.id] ?? [];
      const habitProgress = rangeProgressForHabit(habit, entriesForHabit, from, to);
      scheduled += habitProgress.scheduled;
      completed += habitProgress.completed;
    });
    return { scheduled, completed };
  }, [bounds.from, bounds.to, habits, rangeEntriesByHabit, today]);
  const percent =
    progress.scheduled > 0 ? (progress.completed / progress.scheduled) * 100 : 0;

  const orderedHabits = [...habits].sort((a, b) => a.order - b.order);

  const reorder = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const sourceIdx = orderedHabits.findIndex((habit) => habit.id === sourceId);
    const targetIdx = orderedHabits.findIndex((habit) => habit.id === targetId);
    if (sourceIdx < 0 || targetIdx < 0) return;
    const next = [...orderedHabits];
    const [moved] = next.splice(sourceIdx, 1);
    next.splice(targetIdx, 0, moved);
    void reorderHabits(next.map((habit) => habit.id));
  };

  const weekStrip = (habitId: string): DayState[] => {
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) return ['idle', 'idle', 'idle', 'idle', 'idle', 'idle', 'idle'];
    const entriesForHabit = historyByHabit[habitId] ?? [];
    return buildLast7DayStates(habit, entriesForHabit, today);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <Link
            to="/projects"
            className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
          >
            <span aria-hidden>←</span> Home
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">Habits</h1>
          <p className="text-sm text-muted">
            {new Intl.DateTimeFormat('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            }).format(new Date())}{' '}
            · {progress.completed} of {progress.scheduled} occurrences completed in {activeTab}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/habits/today" className="btn-ghost">
            Today view
          </Link>
          <Link to="/habits/archive" className="btn-ghost">
            View archive
          </Link>
          <Link to="/habits/today" className="btn-primary">
            + New habit
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="segmented">
          {(['today', 'week', 'month', 'all'] as RangeTab[]).map((tab) => (
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
        <p className="text-xs text-muted">N new · Space toggle · / search</p>
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="label">Progress</p>
            <h2 className="mt-1 text-lg font-semibold text-fg">
              {progress.completed}/{progress.scheduled} occurrences
            </h2>
            <p className="text-sm text-muted">Calculated from real {activeTab} history.</p>
          </div>
          <RingProgress percent={percent} />
        </div>
      </div>

      {isLoading || range.isLoading || history7.isLoading ? (
        <p className="text-sm text-muted">Loading habits…</p>
      ) : null}
      {error ? (
        <p className="text-sm text-danger">
          {error instanceof Error ? error.message : 'Failed to load habits.'}
        </p>
      ) : null}
      {range.error ? (
        <p className="text-sm text-danger">
          {range.error instanceof Error ? range.error.message : 'Failed to load history.'}
        </p>
      ) : null}

      <div className="card space-y-2">
        {orderedHabits.length === 0 && !isLoading ? (
          <p className="text-sm text-muted">No habits yet. Add one from Today view.</p>
        ) : null}
        {orderedHabits.map((habit) => (
          <div
            key={habit.id}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('text/habit-id', habit.id);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              event.preventDefault();
              const sourceId = event.dataTransfer.getData('text/habit-id');
              if (sourceId) reorder(sourceId, habit.id);
            }}
          >
            <HabitRow
              habit={habit}
              entry={todayEntries[habit.id] ?? null}
              showWeekStrip
              showStreak
              draggable
              weekData={weekStrip(habit.id)}
              streak={0}
              onOpenDetail={() => navigate(`/habits/${habit.id}`)}
              onToggle={() => void toggleCheck(habit.id)}
              onCount={(n) => void setCount(habit.id, n)}
              onScale={(n) => void setScale(habit.id, n)}
              onNoteOpen={() => {
                const text = window.prompt('Update note', todayEntries[habit.id]?.noteText);
                if (text == null) return;
                void setNote(habit.id, text);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
