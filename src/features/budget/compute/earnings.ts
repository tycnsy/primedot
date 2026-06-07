import type { IncomeEntry, MonthlyEarningsSnapshot } from '../types';
import { compareMonths, isInMonth, isoDate, monthBounds, monthKey } from './dates';

export function earningsForMonth(month: string, entries: IncomeEntry[]): number {
  const key = monthKey(month);
  return Number(
    entries
      .filter((entry) => isInMonth(entry.earnedMonth, key))
      .reduce((sum, entry) => sum + entry.amount, 0)
      .toFixed(2),
  );
}

export function entriesByEarnedMonth(entries: IncomeEntry[]): Map<string, IncomeEntry[]> {
  const map = new Map<string, IncomeEntry[]>();
  for (const entry of entries) {
    const key = monthKey(entry.earnedMonth);
    const list = map.get(key) ?? [];
    list.push(entry);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
  }
  return map;
}

export interface EarningsChartPoint {
  id: string;
  date: string;
  totalAmount: number;
  recordedAt: string;
  note?: string;
}

export interface EarningsChartData {
  month: string;
  monthStart: string;
  monthEnd: string;
  /** One point per day — latest snapshot when multiple exist on the same day. */
  points: EarningsChartPoint[];
  goalAmount?: number;
}

/** Keep only the latest snapshot for each calendar day. */
export function latestSnapshotPerDay(
  snapshots: MonthlyEarningsSnapshot[],
): EarningsChartPoint[] {
  const byDay = new Map<string, MonthlyEarningsSnapshot>();
  for (const snapshot of snapshots) {
    const day = isoDate(new Date(snapshot.recordedAt));
    const existing = byDay.get(day);
    if (!existing || snapshot.recordedAt > existing.recordedAt) {
      byDay.set(day, snapshot);
    }
  }
  return [...byDay.values()]
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .map((snapshot) => ({
      id: snapshot.id,
      date: isoDate(new Date(snapshot.recordedAt)),
      totalAmount: snapshot.totalAmount,
      recordedAt: snapshot.recordedAt,
      note: snapshot.note,
    }));
}

export function buildMonthlyEarningsChartData(args: {
  snapshots: MonthlyEarningsSnapshot[];
  month: string;
  goalAmount?: number;
}): EarningsChartData {
  const key = monthKey(args.month);
  const { start, end } = monthBounds(key);
  const monthSnapshots = args.snapshots.filter((snapshot) =>
    isInMonth(snapshot.earnedMonth, key),
  );

  return {
    month: key,
    monthStart: start,
    monthEnd: end,
    points: latestSnapshotPerDay(monthSnapshots),
    goalAmount: args.goalAmount,
  };
}

/** Convert HTML month input (YYYY-MM) to stored earned month (YYYY-MM-01). */
export function earnedMonthFromInput(value: string): string {
  if (value.length === 7) return `${value}-01`;
  return monthKey(value);
}

/** Convert stored earned month to HTML month input value (YYYY-MM). */
export function earnedMonthToInput(earnedMonth: string): string {
  return monthKey(earnedMonth).slice(0, 7);
}

function daysInMonth(month: string): number {
  const { start, end } = monthBounds(monthKey(month));
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
}

function dayIndexInMonth(asOfDate: string, month: string): number {
  const { start, end } = monthBounds(monthKey(month));
  const clamped = asOfDate < start ? start : asOfDate > end ? end : asOfDate;
  const startDate = new Date(`${start}T00:00:00`);
  const asOf = new Date(`${clamped}T00:00:00`);
  return Math.round((asOf.getTime() - startDate.getTime()) / 86400000) + 1;
}

/** Linear goal pace: $0 on the 1st → goalAmount on the last day of the month. */
export function goalPaceAtDate(month: string, goalAmount: number, asOfDate: string): number {
  const key = monthKey(month);
  const totalDays = daysInMonth(key);
  const dayIndex = dayIndexInMonth(asOfDate, key);
  return Number(((goalAmount * dayIndex) / totalDays).toFixed(2));
}

/** Date used when comparing earnings to goal pace for a viewed month. */
export function paceComparisonDate(
  viewedMonth: string,
  currentMonth: string,
  today: string,
): string | null {
  const viewed = monthKey(viewedMonth);
  const current = monthKey(currentMonth);
  const cmp = compareMonths(viewed, current);
  if (cmp > 0) return null;
  if (cmp === 0) {
    const { start, end } = monthBounds(viewed);
    if (today < start) return start;
    if (today > end) return end;
    return today;
  }
  return monthBounds(viewed).end;
}

export function earningsPaceDelta(
  monthTotal: number,
  goalAmount: number,
  asOfDate: string,
  month: string,
): number {
  const expected = goalPaceAtDate(month, goalAmount, asOfDate);
  return Number((monthTotal - expected).toFixed(2));
}
