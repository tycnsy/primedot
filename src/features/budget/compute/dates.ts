/** Shared date helpers for the budgeting module. All dates are YYYY-MM-DD. */

/** Budget day boundaries use US Eastern (EST/EDT). */
export const BUDGET_TIME_ZONE = 'America/New_York';

/** Calendar date (YYYY-MM-DD) for `now` in the budget timezone. */
export function todayInBudgetTimeZone(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUDGET_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function monthKey(date: Date | string): string {
  if (typeof date === 'string') {
    // Normalize ISO timestamps (e.g. 2026-06-01T00:00:00+00:00) to YYYY-MM-DD.
    const dateOnly = date.slice(0, 10);
    const d = new Date(`${dateOnly}T00:00:00`);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function monthBounds(month: string): { start: string; end: string } {
  const start = new Date(`${monthKey(month)}T00:00:00`);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return { start: isoDate(start), end: isoDate(end) };
}

export function previousMonth(month: string): string {
  const start = new Date(`${monthKey(month)}T00:00:00`);
  start.setMonth(start.getMonth() - 1);
  return monthKey(start);
}

export function nextMonth(month: string): string {
  const start = new Date(`${monthKey(month)}T00:00:00`);
  start.setMonth(start.getMonth() + 1);
  return monthKey(start);
}

export function isInMonth(date: string, month: string): boolean {
  return monthKey(date) === monthKey(month);
}

export function eachDayOfMonth(month: string): string[] {
  const { start, end } = monthBounds(month);
  const result: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    result.push(isoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** Compare two months (YYYY-MM-DD or ISO timestamps). Returns -1, 0, or 1. */
export function compareMonths(a: string, b: string): number {
  const keyA = monthKey(a);
  const keyB = monthKey(b);
  if (keyA < keyB) return -1;
  if (keyA > keyB) return 1;
  return 0;
}

/** True when month is strictly after the month containing `today`. */
export function isFutureMonth(month: string, today: Date = new Date()): boolean {
  return compareMonths(month, monthKey(today)) > 0;
}

/** Last month a category is active before archived_at (first inactive month). */
export function lastActiveMonthFromArchived(archivedAt: string | null): string | null {
  if (!archivedAt) return null;
  return previousMonth(archivedAt);
}

/** archived_at timestamp for a category that ends at endMonth (inclusive). */
export function archivedAtFromEndMonth(endMonth: string): string {
  return `${monthKey(nextMonth(endMonth))}T00:00:00.000Z`;
}

export function monthYearParts(month: string): { year: number; month: number } {
  const d = new Date(`${monthKey(month)}T00:00:00`);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function monthFromParts(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}
