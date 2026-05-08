import { Link, useParams } from 'react-router-dom';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useEntries, useHabitDetail, useHabits } from '../hooks/useHabits';
import RingProgress from '../components/habits/RingProgress';
import type { Habit, HabitKind, HabitTimeOfDay, Schedule } from '../features/habits/types';

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
  const { archiveHabit, updateHabit } = useHabits();
  const today = new Date().toISOString().slice(0, 10);
  const { toggleCheck } = useEntries(today);
  const [activeTab, setActiveTab] = useState<'overview' | 'log' | 'notes' | 'settings'>(
    'overview',
  );
  const [chartRange, setChartRange] = useState<'week' | 'month'>('week');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editKind, setEditKind] = useState<HabitKind>('check');
  const [editTimeOfDay, setEditTimeOfDay] = useState<HabitTimeOfDay>('anytime');
  const [editTarget, setEditTarget] = useState(1);
  const [editScaleMax, setEditScaleMax] = useState(5);
  const [editScheduleType, setEditScheduleType] = useState<Schedule['type']>('daily');
  const [editScheduleCount, setEditScheduleCount] = useState(1);
  const [editWeekdays, setEditWeekdays] = useState<
    ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[]
  >(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [editTags, setEditTags] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const chartDates = useMemo(() => {
    const dates: string[] = [];
    if (chartRange === 'week') {
      for (let d = 6; d >= 0; d -= 1) {
        const date = new Date();
        date.setDate(date.getDate() - d);
        dates.push(date.toISOString().slice(0, 10));
      }
      return dates;
    }
    const today = new Date();
    const daysInMonthSoFar = today.getDate();
    for (let d = daysInMonthSoFar - 1; d >= 0; d -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      dates.push(date.toISOString().slice(0, 10));
    }
    return dates;
  }, [chartRange]);
  const chartLevels = useMemo(() => {
    const entryByDate = new Map(entries.map((entry) => [entry.date, entry]));
    return chartDates.map((key) => {
      const entry = entryByDate.get(key);
      return entry ? levelFor(entry) : 0;
    });
  }, [chartDates, entries]);
  const chartColumns = chartRange === 'week' ? 7 : Math.min(16, chartLevels.length);
  const chartTitle = chartRange === 'week' ? 'Past week' : 'This month';
  const recentLog = log();
  const noteEntries = useMemo(
    () =>
      entries
        .filter((entry) => entry.noteText?.trim())
        .sort((a, b) => b.date.localeCompare(a.date)),
    [entries],
  );

  const openEditModal = () => {
    if (!habit) return;
    populateEditForm(habit);
    setSaveError(null);
    setIsEditOpen(true);
  };

  const closeEditModal = () => {
    setIsEditOpen(false);
    setSaveError(null);
  };

  const populateEditForm = (source: Habit) => {
    setEditName(source.name);
    setEditKind(source.kind);
    setEditTimeOfDay(source.timeOfDay ?? 'anytime');
    setEditTarget(source.target ?? 1);
    setEditScaleMax(source.scaleMax ?? 5);
    setEditTags((source.tags ?? []).join(', '));
    setEditNotes(source.notes ?? '');
    if (source.schedule.type === 'daily') {
      setEditScheduleType('daily');
      setEditScheduleCount(1);
      setEditWeekdays(['mon', 'tue', 'wed', 'thu', 'fri']);
      return;
    }
    if (source.schedule.type === 'weekdays') {
      setEditScheduleType('weekdays');
      setEditWeekdays(source.schedule.days);
      setEditScheduleCount(1);
      return;
    }
    if (source.schedule.type === 'every-n-days') {
      setEditScheduleType('every-n-days');
      setEditScheduleCount(source.schedule.count);
      setEditWeekdays(['mon', 'tue', 'wed', 'thu', 'fri']);
      return;
    }
    setEditScheduleType('times-per-day');
    setEditScheduleCount(source.schedule.count);
    setEditWeekdays(['mon', 'tue', 'wed', 'thu', 'fri']);
  };

  useEffect(() => {
    if (!isEditOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeEditModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isEditOpen]);

  const onSubmitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!habit) return;

    const nextName = editName.trim();
    if (!nextName) {
      setSaveError('Name is required.');
      return;
    }
    if (nextName.length > 60) {
      setSaveError('Name must be 60 characters or fewer.');
      return;
    }

    let nextSchedule: Schedule;
    if (editScheduleType === 'daily') {
      nextSchedule = { type: 'daily' };
    } else if (editScheduleType === 'weekdays') {
      if (editWeekdays.length === 0) {
        setSaveError('Select at least one weekday.');
        return;
      }
      nextSchedule = { type: 'weekdays', days: editWeekdays };
    } else if (editScheduleType === 'every-n-days') {
      const count = Math.max(1, Math.floor(editScheduleCount));
      nextSchedule = { type: 'every-n-days', count };
    } else {
      const count = Math.max(1, Math.floor(editScheduleCount));
      nextSchedule = { type: 'times-per-day', count };
    }

    const nextTarget = Math.max(1, Math.floor(editTarget));
    const nextScaleMax = Math.max(2, Math.floor(editScaleMax));
    if (editKind === 'count' && nextTarget < 1) {
      setSaveError('Count habits require a target of at least 1.');
      return;
    }
    if (editKind === 'scale' && nextScaleMax < 2) {
      setSaveError('Scale habits require a max of at least 2.');
      return;
    }

    const nextTags = editTags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    setIsSaving(true);
    setSaveError(null);
    try {
      await updateHabit(habit.id, {
        name: nextName,
        kind: editKind,
        schedule: nextSchedule,
        target: editKind === 'count' ? nextTarget : undefined,
        scaleMax: editKind === 'scale' ? nextScaleMax : undefined,
        timeOfDay: editTimeOfDay ?? null,
        notes: editNotes.trim() ? editNotes.trim() : undefined,
        tags: nextTags,
      });
      closeEditModal();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save habit changes.');
    } finally {
      setIsSaving(false);
    }
  };

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
        <button type="button" className="btn-ghost" onClick={openEditModal}>
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

      {activeTab === 'overview' ? (
        <div className="space-y-4">
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
              <h2 className="text-base font-semibold text-fg">{chartTitle}</h2>
              <RingProgress percent={stats.consistency} />
            </div>
            <div className="segmented w-fit">
              <button
                type="button"
                data-active={chartRange === 'week'}
                onClick={() => setChartRange('week')}
              >
                Past week
              </button>
              <button
                type="button"
                data-active={chartRange === 'month'}
                onClick={() => setChartRange('month')}
              >
                This month
              </button>
            </div>
            <div
              className="grid gap-1"
              style={{
                gridTemplateColumns: `repeat(${chartColumns}, minmax(0, 1fr))`,
              }}
            >
              {chartLevels.map((level, idx) => (
                <span
                  key={chartDates[idx] ?? idx}
                  className={`h-2.5 rounded-sm ${level === 0 ? 'bg-surface2 ring-1 ring-inset ring-border/70' : ''}`}
                  style={
                    level === 0
                      ? undefined
                      : {
                          backgroundColor:
                            level === 1
                              ? 'rgb(var(--accent) / 0.30)'
                              : level === 2
                                ? 'rgb(var(--accent) / 0.45)'
                                : level === 3
                                  ? 'rgb(var(--accent) / 0.70)'
                                  : 'rgb(var(--accent))',
                        }
                  }
                />
              ))}
            </div>
          </div>

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
        </div>
      ) : null}

      {activeTab === 'log' ? (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-fg">Recent log</h3>
            <span className="text-xs text-muted">{recentLog.length} events</span>
          </div>
          {recentLog.length === 0 ? (
            <p className="text-sm text-muted">No entries yet.</p>
          ) : (
            <ul className="space-y-2">
              {recentLog.slice(0, 30).map((item) => (
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
      ) : null}

      {activeTab === 'notes' ? (
        <div className="space-y-4">
          <div className="card space-y-2">
            <h3 className="text-base font-semibold text-fg">Habit notes</h3>
            <p className="text-sm text-muted">{habit.notes?.trim() || 'No habit-level notes yet.'}</p>
          </div>
          <div className="card space-y-3">
            <h3 className="text-base font-semibold text-fg">Entry notes</h3>
            {noteEntries.length === 0 ? (
              <p className="text-sm text-muted">No daily notes logged yet.</p>
            ) : (
              <ul className="space-y-2">
                {noteEntries.slice(0, 20).map((entry) => (
                  <li key={entry.date} className="rounded-md bg-surface2 px-3 py-2 text-sm">
                    <p className="text-xs text-muted">{entry.date}</p>
                    <p className="mt-1 text-fg">{entry.noteText}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {activeTab === 'settings' ? (
        <div className="space-y-4">
          <div className="card space-y-3">
            <h3 className="text-base font-semibold text-fg">Habit settings</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <SettingItem label="Name" value={habit.name} />
              <SettingItem label="Kind" value={habit.kind} />
              <SettingItem label="Schedule" value={habit.schedule.type} />
              <SettingItem label="Time of day" value={habit.timeOfDay ?? 'anytime'} />
              <SettingItem
                label="Target"
                value={habit.kind === 'count' ? String(habit.target ?? 1) : 'Not applicable'}
              />
              <SettingItem
                label="Scale max"
                value={habit.kind === 'scale' ? String(habit.scaleMax ?? 5) : 'Not applicable'}
              />
            </div>
          </div>
          <div className="card">
            <p className="text-sm text-muted">
              Editable settings controls are coming soon. For now, use the action buttons above to
              manage this habit.
            </p>
          </div>
        </div>
      ) : null}

      {isEditOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-fg">Edit habit</h2>
              <button type="button" className="btn-ghost !px-2 !py-1" onClick={closeEditModal}>
                Esc
              </button>
            </div>
            <form className="space-y-4" onSubmit={onSubmitEdit}>
              <div className="space-y-1">
                <label htmlFor="edit-habit-name" className="label">
                  Name
                </label>
                <input
                  id="edit-habit-name"
                  className="input"
                  value={editName}
                  maxLength={60}
                  required
                  onChange={(event) => setEditName(event.target.value)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="edit-habit-kind" className="label">
                    Kind
                  </label>
                  <select
                    id="edit-habit-kind"
                    className="input"
                    value={editKind}
                    onChange={(event) => setEditKind(event.target.value as HabitKind)}
                  >
                    <option value="check">check</option>
                    <option value="count">count</option>
                    <option value="scale">scale</option>
                    <option value="note">note</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="edit-habit-time" className="label">
                    Time of day
                  </label>
                  <select
                    id="edit-habit-time"
                    className="input"
                    value={editTimeOfDay ?? 'anytime'}
                    onChange={(event) => setEditTimeOfDay(event.target.value as HabitTimeOfDay)}
                  >
                    <option value="morning">morning</option>
                    <option value="anytime">anytime</option>
                    <option value="evening">evening</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="edit-habit-schedule-type" className="label">
                  Schedule
                </label>
                <select
                  id="edit-habit-schedule-type"
                  className="input"
                  value={editScheduleType}
                  onChange={(event) => setEditScheduleType(event.target.value as Schedule['type'])}
                >
                  <option value="daily">daily</option>
                  <option value="weekdays">weekdays</option>
                  <option value="every-n-days">every N days</option>
                  <option value="times-per-day">times per day</option>
                </select>
              </div>

              {editScheduleType === 'weekdays' ? (
                <div className="space-y-1">
                  <span className="label">Weekdays</span>
                  <div className="flex flex-wrap gap-2">
                    {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((day) => (
                      <button
                        key={day}
                        type="button"
                        className={`rounded-md border px-2 py-1 text-xs ${
                          editWeekdays.includes(day)
                            ? 'border-accent/50 bg-accent/15 text-fg'
                            : 'border-border bg-surface2 text-muted'
                        }`}
                        onClick={() =>
                          setEditWeekdays((current) =>
                            current.includes(day)
                              ? current.filter((d) => d !== day)
                              : [...current, day],
                          )
                        }
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {editScheduleType === 'every-n-days' || editScheduleType === 'times-per-day' ? (
                <div className="space-y-1">
                  <label htmlFor="edit-habit-schedule-count" className="label">
                    {editScheduleType === 'every-n-days' ? 'Every how many days' : 'Times per day'}
                  </label>
                  <input
                    id="edit-habit-schedule-count"
                    type="number"
                    min={1}
                    className="input"
                    value={editScheduleCount}
                    onChange={(event) => setEditScheduleCount(Number(event.target.value))}
                  />
                </div>
              ) : null}

              {editKind === 'count' ? (
                <div className="space-y-1">
                  <label htmlFor="edit-habit-target" className="label">
                    Target
                  </label>
                  <input
                    id="edit-habit-target"
                    type="number"
                    min={1}
                    className="input"
                    value={editTarget}
                    onChange={(event) => setEditTarget(Number(event.target.value))}
                  />
                </div>
              ) : null}

              {editKind === 'scale' ? (
                <div className="space-y-1">
                  <label htmlFor="edit-habit-scale-max" className="label">
                    Scale max
                  </label>
                  <input
                    id="edit-habit-scale-max"
                    type="number"
                    min={2}
                    className="input"
                    value={editScaleMax}
                    onChange={(event) => setEditScaleMax(Number(event.target.value))}
                  />
                </div>
              ) : null}

              <div className="space-y-1">
                <label htmlFor="edit-habit-tags" className="label">
                  Tags
                </label>
                <input
                  id="edit-habit-tags"
                  className="input"
                  value={editTags}
                  onChange={(event) => setEditTags(event.target.value)}
                  placeholder="health, focus"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="edit-habit-notes" className="label">
                  Notes
                </label>
                <textarea
                  id="edit-habit-notes"
                  className="input min-h-[90px] resize-y"
                  value={editNotes}
                  onChange={(event) => setEditNotes(event.target.value)}
                  placeholder="Any context for this habit..."
                />
              </div>

              {saveError ? <p className="text-sm text-danger">{saveError}</p> : null}

              <div className="flex justify-end gap-2">
                <button type="button" className="btn-ghost" onClick={closeEditModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
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
      <p
        className={`mt-1 text-lg font-semibold ${accent ? '' : 'text-fg'}`}
        style={accent ? { color: 'rgb(var(--accent))' } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function SettingItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="mt-1 text-sm text-fg">{value}</p>
    </div>
  );
}
