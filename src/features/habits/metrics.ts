import type { DayState, Habit, HabitEntry, HabitStats } from './types';

const weekdayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function parseLocalDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function listDates(from: string, to: string): string[] {
  const start = parseLocalDate(from);
  const end = parseLocalDate(to);
  const out: string[] = [];
  for (let current = start; current <= end; current = addDays(current, 1)) {
    out.push(formatLocalDate(current));
  }
  return out;
}

function daysBetween(fromDate: string, toDate: string): number {
  const from = parseLocalDate(fromDate);
  const to = parseLocalDate(toDate);
  const diffMs = to.getTime() - from.getTime();
  return Math.floor(diffMs / 86_400_000);
}

function isScheduledOnDayStatic(habit: Habit, date: string): boolean {
  const schedule = habit.schedule;
  if (schedule.type === 'daily') return true;
  if (schedule.type === 'weekdays') {
    const day = weekdayKeys[parseLocalDate(date).getDay()];
    return schedule.days.includes(day);
  }
  if (schedule.type === 'times-per-day') return true;
  if (schedule.type === 'every-n-days') return true;
  return true;
}

function entryDoneUnits(habit: Habit, entry: HabitEntry | undefined): number {
  if (!entry) return 0;
  if (habit.kind === 'check') return entry.done ? 1 : 0;
  if (habit.kind === 'count') return Math.max(0, entry.count ?? 0);
  if (habit.kind === 'scale') return (entry.scale ?? 0) > 0 ? 1 : 0;
  return entry.noteText?.trim() ? 1 : 0;
}

export function dayStateForHabitEntry(habit: Habit, entry: HabitEntry | undefined): DayState {
  const units = entryDoneUnits(habit, entry);
  if (habit.kind === 'count') {
    const target = habit.target ?? 1;
    if (units >= target) return 'done';
    if (units > 0) return 'partial';
    if (entry?.done === false) return 'skip';
    return 'idle';
  }
  if (units > 0) return 'done';
  if (entry?.done === false) return 'skip';
  return 'idle';
}

function dayRequiredOccurrences(habit: Habit): number {
  return habit.schedule.type === 'times-per-day' ? Math.max(1, habit.schedule.count) : 1;
}

function rangeFromEntriesOrCreatedAt(habit: Habit, entries: HabitEntry[], anchorDate: string): string {
  if (habit.createdAt) return habit.createdAt.slice(0, 10);
  if (entries.length > 0) {
    return [...entries].sort((a, b) => a.date.localeCompare(b.date))[0].date;
  }
  return anchorDate;
}

function completionForDay(habit: Habit, entry: HabitEntry | undefined): boolean {
  const units = entryDoneUnits(habit, entry);
  if (habit.schedule.type === 'times-per-day') {
    return units >= Math.max(1, habit.schedule.count);
  }
  return units >= 1;
}

function hasLoggedProgress(entry: HabitEntry | undefined): boolean {
  return (
    entry != null &&
    (entry.done != null || entry.count != null || entry.scale != null || !!entry.noteText?.trim())
  );
}

export function cadenceStatusForDate(
  habit: Habit,
  entries: HabitEntry[],
  date: string,
): {
  due: boolean;
  completedOnDate: boolean;
  daysSinceLastCompletion: number | null;
  daysUntilDue: number;
} {
  const entriesByDate = new Map(entries.map((entry) => [entry.date, entry]));
  const completedOnDate = completionForDay(habit, entriesByDate.get(date));
  if (habit.schedule.type !== 'every-n-days') {
    const due = isScheduledOnDayStatic(habit, date);
    return { due, completedOnDate, daysSinceLastCompletion: null, daysUntilDue: due ? 0 : 1 };
  }

  const interval = Math.max(1, habit.schedule.count);
  const lastCompletedDate = entries
    .filter((entry) => entry.date <= date && completionForDay(habit, entry))
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.date;

  if (!lastCompletedDate) {
    return { due: true, completedOnDate, daysSinceLastCompletion: null, daysUntilDue: 0 };
  }

  const daysSinceLastCompletion = daysBetween(lastCompletedDate, date);
  const due = daysSinceLastCompletion >= interval;
  return {
    due,
    completedOnDate,
    daysSinceLastCompletion,
    daysUntilDue: due ? 0 : interval - daysSinceLastCompletion,
  };
}

export function rangeProgressForHabit(
  habit: Habit,
  entries: HabitEntry[],
  from: string,
  to: string,
): { scheduled: number; completed: number } {
  const entriesByDate = new Map(entries.map((entry) => [entry.date, entry]));

  if (habit.schedule.type === 'every-n-days') {
    const interval = Math.max(1, habit.schedule.count);
    const start = rangeFromEntriesOrCreatedAt(habit, entries, to);
    let lastCompletedDate: string | null = null;
    let scheduled = 0;
    let completed = 0;
    for (const date of listDates(start, to)) {
      const didComplete = completionForDay(habit, entriesByDate.get(date));
      const due = !lastCompletedDate || daysBetween(lastCompletedDate, date) >= interval;
      const countedOccurrence = due || didComplete;
      if (countedOccurrence && date >= from) {
        scheduled += 1;
        if (didComplete) completed += 1;
      }
      if (didComplete) {
        lastCompletedDate = date;
      }
    }
    return { scheduled, completed };
  }

  let scheduled = 0;
  let completed = 0;
  for (const date of listDates(from, to)) {
    if (!isScheduledOnDayStatic(habit, date)) continue;
    const required = dayRequiredOccurrences(habit);
    const units = entryDoneUnits(habit, entriesByDate.get(date));
    scheduled += required;
    completed += Math.min(required, units);
  }
  return { scheduled, completed };
}

export function buildLast7DayStates(
  habit: Habit,
  entries: HabitEntry[],
  endDate: string,
): DayState[] {
  const entriesByDate = new Map(entries.map((entry) => [entry.date, entry]));
  const end = parseLocalDate(endDate);
  const states: DayState[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = formatLocalDate(addDays(end, -i));
    if (!isScheduledOnDayStatic(habit, date)) {
      states.push('skip');
      continue;
    }
    if (habit.schedule.type === 'every-n-days') {
      const cadence = cadenceStatusForDate(habit, entries, date);
      if (!cadence.due && !cadence.completedOnDate) {
        states.push('skip');
        continue;
      }
    }
    states.push(dayStateForHabitEntry(habit, entriesByDate.get(date)));
  }
  return states;
}

function dayBasedStreak(habit: Habit, entries: HabitEntry[], anchorDate: string) {
  const start = rangeFromEntriesOrCreatedAt(habit, entries, anchorDate);
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  let scheduledDays: string[] = [];
  let completion: boolean[] = [];

  if (habit.schedule.type === 'every-n-days') {
    const interval = Math.max(1, habit.schedule.count);
    let lastCompletedDate: string | null = null;
    for (const date of listDates(start, anchorDate)) {
      const didComplete = completionForDay(habit, byDate.get(date));
      const due = !lastCompletedDate || daysBetween(lastCompletedDate, date) >= interval;
      if (due || didComplete) {
        scheduledDays.push(date);
        completion.push(didComplete);
      }
      if (didComplete) {
        lastCompletedDate = date;
      }
    }
  } else {
    scheduledDays = listDates(start, anchorDate).filter((date) => isScheduledOnDayStatic(habit, date));
    completion = scheduledDays.map((date) => completionForDay(habit, byDate.get(date)));
  }

  let longest = 0;
  let run = 0;
  completion.forEach((done) => {
    if (done) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  });

  let current = 0;
  let cursor = completion.length - 1;
  const lastScheduledDate = scheduledDays[cursor];
  if (lastScheduledDate === anchorDate && !completion[cursor]) {
    const anchorEntry = byDate.get(anchorDate);
    if (!hasLoggedProgress(anchorEntry)) {
      cursor -= 1;
    }
  }

  for (let i = cursor; i >= 0; i -= 1) {
    if (!completion[i]) break;
    current += 1;
  }

  return { current, longest };
}

function recentOccurrenceConsistency(habit: Habit, entries: HabitEntry[], anchorDate: string) {
  if (habit.schedule.type === 'every-n-days') {
    const start = rangeFromEntriesOrCreatedAt(habit, entries, anchorDate);
    const byDate = new Map(entries.map((entry) => [entry.date, entry]));
    const interval = Math.max(1, habit.schedule.count);
    let lastCompletedDate: string | null = null;
    const occurrences: boolean[] = [];
    for (const date of listDates(start, anchorDate)) {
      const didComplete = completionForDay(habit, byDate.get(date));
      const due = !lastCompletedDate || daysBetween(lastCompletedDate, date) >= interval;
      if (due || didComplete) {
        occurrences.push(didComplete);
      }
      if (didComplete) {
        lastCompletedDate = date;
      }
    }
    const recent = occurrences.slice(-30);
    if (recent.length === 0) return 0;
    const completed = recent.filter(Boolean).length;
    return Math.round((completed / recent.length) * 100);
  }

  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  let scheduled = 0;
  let completed = 0;
  let cursor = parseLocalDate(anchorDate);

  while (scheduled < 30) {
    const date = formatLocalDate(cursor);
    if (isScheduledOnDayStatic(habit, date)) {
      const required = dayRequiredOccurrences(habit);
      const remaining = Math.min(required, 30 - scheduled);
      scheduled += remaining;
      completed += Math.min(remaining, entryDoneUnits(habit, byDate.get(date)));
    }
    cursor = addDays(cursor, -1);
  }

  return scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
}

export function calcHabitStatsScheduleAware(
  habit: Habit,
  entries: HabitEntry[],
  anchorDate: string,
): HabitStats {
  const { completed: total } = rangeProgressForHabit(
    habit,
    entries,
    rangeFromEntriesOrCreatedAt(habit, entries, anchorDate),
    anchorDate,
  );

  const monthStart = (() => {
    const d = parseLocalDate(anchorDate);
    d.setDate(1);
    return formatLocalDate(d);
  })();
  const monthProgress = rangeProgressForHabit(habit, entries, monthStart, anchorDate);

  const streak = dayBasedStreak(habit, entries, anchorDate);
  const consistency = recentOccurrenceConsistency(habit, entries, anchorDate);

  return {
    currentStreak: streak.current,
    longestStreak: streak.longest,
    thisMonth: { done: monthProgress.completed, total: monthProgress.scheduled },
    consistency,
    total,
  };
}
