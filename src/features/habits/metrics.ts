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

function startOfWeekMonday(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

function weekId(date: Date): string {
  return formatLocalDate(startOfWeekMonday(date));
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

function isScheduledOnDay(habit: Habit, date: string): boolean {
  const schedule = habit.schedule;
  if (schedule.type === 'daily') return true;
  if (schedule.type === 'weekdays') {
    const day = weekdayKeys[parseLocalDate(date).getDay()];
    return schedule.days.includes(day);
  }
  if (schedule.type === 'times-per-day') return true;
  if (schedule.type === 'times-per-week') return true;
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

export function rangeProgressForHabit(
  habit: Habit,
  entries: HabitEntry[],
  from: string,
  to: string,
): { scheduled: number; completed: number } {
  const entriesByDate = new Map(entries.map((entry) => [entry.date, entry]));

  if (habit.schedule.type === 'times-per-week') {
    const weekMap = new Map<string, number>();
    for (const date of listDates(from, to)) {
      if (!isScheduledOnDay(habit, date)) continue;
      const id = weekId(parseLocalDate(date));
      const units = entryDoneUnits(habit, entriesByDate.get(date));
      weekMap.set(id, (weekMap.get(id) ?? 0) + units);
    }
    const target = Math.max(1, habit.schedule.count);
    const scheduled = weekMap.size * target;
    let completed = 0;
    weekMap.forEach((value) => {
      completed += Math.min(target, value);
    });
    return { scheduled, completed };
  }

  let scheduled = 0;
  let completed = 0;
  for (const date of listDates(from, to)) {
    if (!isScheduledOnDay(habit, date)) continue;
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
    if (!isScheduledOnDay(habit, date)) {
      states.push('skip');
      continue;
    }
    states.push(dayStateForHabitEntry(habit, entriesByDate.get(date)));
  }
  return states;
}

function completionForDay(habit: Habit, entry: HabitEntry | undefined): boolean {
  const units = entryDoneUnits(habit, entry);
  if (habit.schedule.type === 'times-per-day') {
    return units >= Math.max(1, habit.schedule.count);
  }
  return units >= 1;
}

function timesPerWeekStreak(habit: Habit, entries: HabitEntry[], anchorDate: string) {
  const start = rangeFromEntriesOrCreatedAt(habit, entries, anchorDate);
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  const weekTotals = new Map<string, number>();
  for (const date of listDates(start, anchorDate)) {
    const id = weekId(parseLocalDate(date));
    const units = entryDoneUnits(habit, byDate.get(date));
    weekTotals.set(id, (weekTotals.get(id) ?? 0) + units);
  }
  const target =
    habit.schedule.type === 'times-per-week' ? Math.max(1, habit.schedule.count) : 1;
  const orderedWeeks = [...weekTotals.keys()].sort();
  const completedWeeks = orderedWeeks.map((id) => (weekTotals.get(id) ?? 0) >= target);

  let longest = 0;
  let run = 0;
  completedWeeks.forEach((done) => {
    if (done) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  });

  let current = 0;
  for (let i = completedWeeks.length - 1; i >= 0; i -= 1) {
    if (!completedWeeks[i]) break;
    current += 1;
  }

  return { current, longest };
}

function dayBasedStreak(habit: Habit, entries: HabitEntry[], anchorDate: string) {
  const start = rangeFromEntriesOrCreatedAt(habit, entries, anchorDate);
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  const scheduledDays = listDates(start, anchorDate).filter((date) => isScheduledOnDay(habit, date));
  const completion = scheduledDays.map((date) => completionForDay(habit, byDate.get(date)));

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
  for (let i = completion.length - 1; i >= 0; i -= 1) {
    if (!completion[i]) break;
    current += 1;
  }

  return { current, longest };
}

function recentOccurrenceConsistency(habit: Habit, entries: HabitEntry[], anchorDate: string) {
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  let scheduled = 0;
  let completed = 0;
  let cursor = parseLocalDate(anchorDate);

  while (scheduled < 30) {
    const date = formatLocalDate(cursor);
    if (habit.schedule.type === 'times-per-week') {
      const weekStart = startOfWeekMonday(cursor);
      const weekDates = Array.from({ length: 7 }, (_, i) => formatLocalDate(addDays(weekStart, i)));
      const inRangeDates = weekDates.filter((d) => d <= anchorDate);
      const weekUnits = inRangeDates.reduce(
        (sum, day) => sum + entryDoneUnits(habit, byDate.get(day)),
        0,
      );
      const target = Math.max(1, habit.schedule.count);
      const remaining = Math.min(target, 30 - scheduled);
      scheduled += remaining;
      completed += Math.min(remaining, weekUnits);
      cursor = addDays(weekStart, -1);
      continue;
    }

    if (isScheduledOnDay(habit, date)) {
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

  const streak =
    habit.schedule.type === 'times-per-week'
      ? timesPerWeekStreak(habit, entries, anchorDate)
      : dayBasedStreak(habit, entries, anchorDate);

  const consistency = recentOccurrenceConsistency(habit, entries, anchorDate);

  return {
    currentStreak: streak.current,
    longestStreak: streak.longest,
    thisMonth: { done: monthProgress.completed, total: monthProgress.scheduled },
    consistency,
    total,
  };
}
