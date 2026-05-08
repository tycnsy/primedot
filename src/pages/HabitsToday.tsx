import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { HabitRow, RingProgress } from '../components/habits';
import { useEntries, useHabitStreaks, useHabits } from '../hooks/useHabits';
import type {
  Habit,
  HabitEntry,
  HabitKind,
  Schedule,
  HabitTimeOfDay,
  NewHabit,
} from '../features/habits/types';

function localDateString() {
  return new Date().toISOString().slice(0, 10);
}

function parseDateInput(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function dateLabel(today: Date) {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(today);
  const monthDay = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
  }).format(today);
  return `${weekday} · ${monthDay}`.toUpperCase();
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function firstName(email: string | undefined) {
  if (!email) return 'there';
  const left = email.split('@')[0] ?? '';
  return left.length > 0 ? left.charAt(0).toUpperCase() + left.slice(1) : 'there';
}

function sectionLabel(timeOfDay: HabitTimeOfDay) {
  if (timeOfDay === 'morning') return 'Morning';
  if (timeOfDay === 'evening') return 'Evening';
  return 'During the day';
}

function matchesSection(habit: Habit, timeOfDay: HabitTimeOfDay) {
  if (timeOfDay === 'anytime') return !habit.timeOfDay || habit.timeOfDay === 'anytime';
  return habit.timeOfDay === timeOfDay;
}

type NewScheduleOption = 'daily' | 'weekdays' | 'every-n-days' | 'times-per-day';

function isHabitDone(habit: Habit, entry: HabitEntry | undefined): boolean {
  if (!entry) return false;
  switch (habit.kind) {
    case 'check':
      return entry.done === true;
    case 'count':
      return (entry.count ?? 0) >= (habit.target ?? 1);
    case 'scale':
      return (entry.scale ?? 0) > 0;
    case 'note':
      return Boolean(entry.noteText?.trim());
    default:
      return false;
  }
}

export default function HabitsToday() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    habits,
    isLoading: habitsLoading,
    error: habitsError,
    createHabit: createHabitAsync,
  } = useHabits();
  const todayDate = localDateString();
  const [selectedLogDate, setSelectedLogDate] = useState(todayDate);
  const {
    entries,
    isLoading: entriesLoading,
    error: entriesError,
    toggleCheck,
    setCount,
    setScale,
    setNote,
  } = useEntries(selectedLogDate);
  const streaks = useHabitStreaks(habits, selectedLogDate);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [isNewHabitOpen, setIsNewHabitOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<HabitKind>('check');
  const [newTarget, setNewTarget] = useState(1);
  const [newUnit, setNewUnit] = useState('');
  const [newScaleMax, setNewScaleMax] = useState(5);
  const [newSchedule, setNewSchedule] = useState<NewScheduleOption>('daily');
  const [newScheduleCount, setNewScheduleCount] = useState(2);
  const [newTimeOfDay, setNewTimeOfDay] = useState<HabitTimeOfDay>('anytime');
  const [newTags, setNewTags] = useState('');

  const sortedHabits = useMemo(() => [...habits].sort((a, b) => a.order - b.order), [habits]);

  const visibleHabits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedHabits;
    return sortedHabits.filter((habit) => habit.name.toLowerCase().includes(q));
  }, [search, sortedHabits]);

  const doneCount = useMemo(
    () => visibleHabits.filter((habit) => isHabitDone(habit, entries[habit.id])).length,
    [entries, visibleHabits],
  );
  const totalCount = visibleHabits.length;
  const percent = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  const focusableHabits = visibleHabits;

  useEffect(() => {
    setFocusedIndex((current) => {
      if (focusableHabits.length === 0) return -1;
      if (current < 0) return -1;
      return Math.min(current, focusableHabits.length - 1);
    });
  }, [focusableHabits.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typingContext =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if (event.key === 'Escape') {
        if (isNewHabitOpen) {
          setIsNewHabitOpen(false);
          return;
        }
        setFocusedIndex(-1);
        return;
      }

      if (!typingContext && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setIsNewHabitOpen(true);
        return;
      }

      if (!typingContext && event.key === '/') {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (!typingContext && event.key === 'ArrowDown') {
        event.preventDefault();
        setFocusedIndex((idx) => {
          if (focusableHabits.length === 0) return -1;
          return Math.min(idx + 1, focusableHabits.length - 1);
        });
        return;
      }

      if (!typingContext && event.key === 'ArrowUp') {
        event.preventDefault();
        setFocusedIndex((idx) => Math.max(idx - 1, -1));
        return;
      }

      if (!typingContext && event.key === ' ' && focusableHabits.length > 0 && focusedIndex >= 0) {
        event.preventDefault();
        const habit = focusableHabits[focusedIndex];
        if (habit?.kind === 'check') {
          void toggleCheck(habit.id);
        }
      }

      if (!typingContext && event.key === 'Enter' && focusableHabits.length > 0 && focusedIndex >= 0) {
        event.preventDefault();
        const habit = focusableHabits[focusedIndex];
        if (habit) navigate(`/habits/${habit.id}`);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusableHabits, focusedIndex, isNewHabitOpen, navigate, toggleCheck]);

  const handleCreateHabit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;

    const schedule: Schedule =
      newSchedule === 'daily'
        ? { type: 'daily' }
        : newSchedule === 'weekdays'
          ? { type: 'weekdays', days: ['mon', 'tue', 'wed', 'thu', 'fri'] }
          : newSchedule === 'every-n-days'
            ? { type: 'every-n-days', count: Math.max(1, Math.floor(newScheduleCount)) }
            : { type: 'times-per-day', count: Math.max(1, Math.floor(newScheduleCount)) };

    const payload: NewHabit = {
      name,
      kind: newKind,
      schedule,
      timeOfDay: newTimeOfDay,
      ...(newKind === 'count' ? { target: Math.max(1, newTarget), unit: newUnit.trim() } : {}),
      ...(newKind === 'scale' ? { scaleMax: Math.max(2, newScaleMax) } : {}),
      ...(newTags.trim()
        ? { tags: newTags.split(',').map((tag) => tag.trim()).filter(Boolean) }
        : {}),
    };
    void createHabitAsync(payload);

    setIsNewHabitOpen(false);
    setNewName('');
    setNewKind('check');
    setNewTarget(1);
    setNewUnit('');
    setNewScaleMax(5);
    setNewSchedule('daily');
    setNewScheduleCount(2);
    setNewTimeOfDay('anytime');
    setNewTags('');
  };

  const sections: HabitTimeOfDay[] = ['morning', 'anytime', 'evening'];
  const logDate = parseDateInput(selectedLogDate);
  const isLoading = habitsLoading || entriesLoading || streaks.isLoading;
  const error = habitsError ?? entriesError ?? streaks.error;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            to="/habits"
            className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
          >
            <span aria-hidden>←</span> Habits
          </Link>
          <p className="label">{dateLabel(logDate)}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">
            Good {getGreeting()}, {firstName(user?.email)}.
          </h1>
          <p className="text-sm text-muted">
            {doneCount} of {totalCount} habits checked off for{' '}
            {selectedLogDate === todayDate ? 'today' : selectedLogDate}
          </p>
        </div>
        <div className="pt-2">
          <RingProgress percent={percent} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          ref={searchInputRef}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search habits…"
          className="input max-w-sm"
          aria-label="Search habits"
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          Log date
          <input
            type="date"
            className="input"
            value={selectedLogDate}
            max={todayDate}
            onChange={(event) => setSelectedLogDate(event.target.value || todayDate)}
            aria-label="Select log date"
          />
        </label>
      </div>

      {isLoading ? <p className="text-sm text-muted">Loading habits…</p> : null}
      {error ? (
        <p className="text-sm text-danger">
          {error instanceof Error ? error.message : 'Failed to load habits.'}
        </p>
      ) : null}
      {!isLoading && !error && visibleHabits.length === 0 ? (
        <div className="card text-center text-sm text-muted">
          No habits yet. Create your first one to get started.
        </div>
      ) : null}

      {sections.map((slot) => {
        const sectionHabits = visibleHabits.filter((habit) => matchesSection(habit, slot));
        return (
          <section key={slot} className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-fg">{sectionLabel(slot)}</h2>
              <span className="text-xs text-muted">{sectionHabits.length}</span>
            </div>
            {sectionHabits.length === 0 ? (
              <p className="text-sm text-muted">No habits in this section.</p>
            ) : (
              <div className="space-y-2">
                {sectionHabits.map((habit) => {
                  const index = focusableHabits.findIndex((item) => item.id === habit.id);
                  return (
                    <HabitRow
                      key={habit.id}
                      habit={habit}
                      entry={(entries[habit.id] as HabitEntry | undefined) ?? null}
                      showWeekStrip={false}
                      showStreak
                      streak={streaks.streaksByHabit[habit.id] ?? 0}
                      notDueToday={streaks.notDueTodayByHabit[habit.id] ?? false}
                      notDueLabel={streaks.notDueLabelByHabit[habit.id] ?? null}
                      focused={index === focusedIndex}
                      onFocus={() => setFocusedIndex(index)}
                      onOpenDetail={() => navigate(`/habits/${habit.id}`)}
                      onToggle={() => void toggleCheck(habit.id)}
                      onCount={(n) => void setCount(habit.id, n)}
                      onScale={(n) => void setScale(habit.id, n)}
                      onNoteOpen={() => {
                        const text = window.prompt(
                          `Log a note for ${selectedLogDate}`,
                          entries[habit.id]?.noteText,
                        );
                        if (text == null) return;
                        void setNote(habit.id, text);
                      }}
                    />
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <div className="flex justify-center">
        <button type="button" className="btn-primary" onClick={() => setIsNewHabitOpen(true)}>
          Quick-add habit <span className="font-mono text-xs">N</span>
        </button>
      </div>

      {isNewHabitOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-fg">New habit</h2>
              <button
                type="button"
                onClick={() => setIsNewHabitOpen(false)}
                className="btn-ghost !px-2 !py-1"
              >
                Esc
              </button>
            </div>

            <form
              className="space-y-4"
              onSubmit={handleCreateHabit}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  (
                    event.currentTarget as HTMLFormElement
                  ).requestSubmit();
                }
              }}
            >
              <div className="space-y-1">
                <label htmlFor="habit-name" className="label">
                  Name
                </label>
                <input
                  id="habit-name"
                  className="input"
                  value={newName}
                  maxLength={60}
                  required
                  onChange={(event) => setNewName(event.target.value)}
                />
              </div>

              <div className="space-y-1">
                <span className="label">Kind</span>
                <div className="segmented">
                  {(['check', 'count', 'scale', 'note'] as HabitKind[]).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      data-active={newKind === kind}
                      onClick={() => setNewKind(kind)}
                    >
                      {kind}
                    </button>
                  ))}
                </div>
              </div>

              {newKind === 'count' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="habit-target" className="label">
                      Target
                    </label>
                    <input
                      id="habit-target"
                      type="number"
                      min={1}
                      value={newTarget}
                      onChange={(event) => setNewTarget(Number(event.target.value))}
                      className="input"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="habit-unit" className="label">
                      Unit
                    </label>
                    <input
                      id="habit-unit"
                      value={newUnit}
                      onChange={(event) => setNewUnit(event.target.value)}
                      className="input"
                      placeholder="glasses"
                    />
                  </div>
                </div>
              ) : null}

              {newKind === 'scale' ? (
                <div className="space-y-1">
                  <label htmlFor="habit-scale-max" className="label">
                    Scale max
                  </label>
                  <input
                    id="habit-scale-max"
                    type="number"
                    min={2}
                    value={newScaleMax}
                    onChange={(event) => setNewScaleMax(Number(event.target.value))}
                    className="input"
                  />
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <span className="label">Schedule</span>
                  <div className="segmented">
                    {(['daily', 'weekdays', 'every-n-days', 'times-per-day'] as NewScheduleOption[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        data-active={newSchedule === option}
                        onClick={() => setNewSchedule(option)}
                      >
                        {option === 'every-n-days'
                          ? 'every N days'
                          : option === 'times-per-day'
                            ? 'times/day'
                            : option}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="label">Time of day</span>
                  <div className="segmented">
                    {(['morning', 'anytime', 'evening'] as HabitTimeOfDay[]).map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        data-active={newTimeOfDay === slot}
                        onClick={() => setNewTimeOfDay(slot)}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {(newSchedule === 'every-n-days' || newSchedule === 'times-per-day') ? (
                <div className="space-y-1">
                  <label htmlFor="new-habit-schedule-count" className="label">
                    {newSchedule === 'every-n-days' ? 'Every how many days' : 'Times per day'}
                  </label>
                  <input
                    id="new-habit-schedule-count"
                    type="number"
                    min={1}
                    className="input"
                    value={newScheduleCount}
                    onChange={(event) => setNewScheduleCount(Number(event.target.value))}
                  />
                </div>
              ) : null}

              <div className="space-y-1">
                <label htmlFor="habit-tags" className="label">
                  Tags
                </label>
                <input
                  id="habit-tags"
                  value={newTags}
                  onChange={(event) => setNewTags(event.target.value)}
                  className="input"
                  placeholder="health, focus"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewHabitOpen(false)}
                  className="btn-ghost"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save habit
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
