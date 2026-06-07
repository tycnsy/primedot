import type { IncomeAdjustment, IncomeEntry } from '../types';
import { isoDate, monthBounds } from './dates';

export type ProjectionPointKind = 'anchor' | 'income' | 'adjustment' | 'projection';

export interface ProjectionPoint {
  date: string;
  totalIncome: number;
  /** Income added on this day (0 when none). */
  incomeAdded: number;
  /** Source responsible for this specific point, when income is added. */
  sourceName?: string;
  /** Income entry id for point-level interactions in the UI. */
  entryId?: string;
  kind?: ProjectionPointKind;
  /** True when the day's added income is fully confirmed (received). */
  confirmed: boolean;
  /** True for days on/after today (the projected portion of the line). */
  projected: boolean;
}

export interface ProjectMonthlyIncomeArgs {
  incomeEntries: IncomeEntry[];
  month: string;
  /** Defaults to today in local time. */
  today?: string;
}

/**
 * Produces a projected cumulative monthly income line that always starts from 0
 * at the first of the month, and then adds each income entry at its expected date.
 */
export function projectMonthlyIncome({
  incomeEntries,
  month,
  today,
}: ProjectMonthlyIncomeArgs): ProjectionPoint[] {
  const { start, end } = monthBounds(month);
  const todayIso = today ?? isoDate(new Date());
  const sorted = incomeEntries
    .filter((entry) => entry.expectedDate >= start && entry.expectedDate <= end)
    .slice()
    .sort((a, b) =>
      a.expectedDate.localeCompare(b.expectedDate) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
    );

  const points: ProjectionPoint[] = [];
  let totalIncome = 0;
  points.push({
    date: start,
    totalIncome: 0,
    incomeAdded: 0,
    confirmed: true,
    projected: start > todayIso,
  });

  for (const entry of sorted) {
    totalIncome += entry.amount;
    points.push({
      date: entry.expectedDate,
      totalIncome: Number(totalIncome.toFixed(2)),
      incomeAdded: Number(entry.amount.toFixed(2)),
      sourceName: entry.sourceName,
      entryId: entry.id,
      kind: 'income',
      confirmed: entry.status === 'received',
      projected: entry.expectedDate > todayIso,
    });
  }

  const dates = new Set(points.map((point) => point.date));
  if (todayIso >= start && todayIso <= end && !dates.has(todayIso)) {
    const cumulativeToToday = sorted
      .filter((entry) => entry.expectedDate <= todayIso)
      .reduce((sum, entry) => sum + entry.amount, 0);
    points.push({
      date: todayIso,
      totalIncome: Number(cumulativeToToday.toFixed(2)),
      incomeAdded: 0,
      kind: 'anchor',
      confirmed: true,
      projected: false,
    });
  }

  if (!dates.has(end) && points[points.length - 1]?.date !== end) {
    points.push({
      date: end,
      totalIncome: Number(totalIncome.toFixed(2)),
      incomeAdded: 0,
      kind: 'anchor',
      confirmed: true,
      projected: end > todayIso,
    });
  }

  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}

export interface ProjectSourceIncomeHistoryArgs {
  entry: IncomeEntry;
  incomeEntries: IncomeEntry[];
  adjustments?: IncomeAdjustment[];
  today?: string;
}

export interface SourceIncomeHistoryResult {
  points: ProjectionPoint[];
  cutoffDate: string;
  horizonEnd: string;
}

/** Cumulative income through the cutoff date (inclusive). */
export function cutoffIncomeTotal(points: ProjectionPoint[], cutoffDate: string): number {
  let total = 0;
  for (const point of points) {
    if (point.date > cutoffDate) break;
    if (point.kind === 'income' && point.incomeAdded > 0) {
      total += point.incomeAdded;
    }
  }
  return Number(total.toFixed(2));
}

/**
 * Projects cumulative income for the selected source from creation through the
 * end of the entry's expected month, including future expected income.
 */
export function projectSourceIncomeHistory({
  entry,
  incomeEntries,
  adjustments = [],
  today,
}: ProjectSourceIncomeHistoryArgs): SourceIncomeHistoryResult {
  const start = entry.createdAt.slice(0, 10);
  const todayIso = today ?? isoDate(new Date());
  const cutoffDate =
    entry.status === 'received' && entry.receivedDate ? entry.receivedDate : todayIso;
  const { end: horizonEnd } = monthBounds(entry.expectedDate);
  const sourceKey = entry.sourceName.trim().toLowerCase();

  type TimelineEvent =
    | {
        kind: 'income';
        date: string;
        sortKey: string;
        entry: IncomeEntry;
      }
    | {
        kind: 'adjustment';
        date: string;
        sortKey: string;
        adjustment: IncomeAdjustment;
      }
    | {
        kind: 'projection';
        date: string;
        sortKey: string;
        entry: IncomeEntry;
      };

  const events: TimelineEvent[] = [];

  for (const candidate of incomeEntries) {
    if (candidate.sourceName.trim().toLowerCase() !== sourceKey) continue;
    if (candidate.expectedDate < start || candidate.expectedDate > horizonEnd) continue;
    events.push({
      kind: 'income',
      date: candidate.expectedDate,
      sortKey: `${candidate.expectedDate}T${candidate.createdAt}`,
      entry: candidate,
    });
  }

  for (const adjustment of adjustments) {
    if (adjustment.incomeEntryId !== entry.id) continue;
    events.push({
      kind: 'adjustment',
      date: adjustment.adjustedAt.slice(0, 10),
      sortKey: adjustment.adjustedAt,
      adjustment,
    });
  }

  if (entry.expectedDate >= start) {
    events.push({
      kind: 'projection',
      date: start,
      sortKey: `${start}T${entry.createdAt}`,
      entry,
    });
  }

  events.sort(
    (a, b) => a.date.localeCompare(b.date) || a.sortKey.localeCompare(b.sortKey),
  );

  const points: ProjectionPoint[] = [
    {
      date: start,
      totalIncome: 0,
      incomeAdded: 0,
      kind: 'anchor',
      confirmed: true,
      projected: start > todayIso,
    },
  ];

  let totalIncome = 0;
  const seenIncomeIds = new Set<string>();

  for (const event of events) {
    if (event.kind === 'projection') {
      points.push({
        date: event.date,
        totalIncome: Number(totalIncome.toFixed(2)),
        incomeAdded: Number(event.entry.amount.toFixed(2)),
        sourceName: event.entry.sourceName,
        entryId: event.entry.id,
        kind: 'projection',
        confirmed: event.entry.status === 'received',
        projected: event.entry.expectedDate > todayIso || event.entry.status === 'expected',
      });
      continue;
    }

    if (event.kind === 'adjustment') {
      const delta = Number(
        (event.adjustment.newAmount - event.adjustment.oldAmount).toFixed(2),
      );
      points.push({
        date: event.date,
        totalIncome: Number(totalIncome.toFixed(2)),
        incomeAdded: delta,
        sourceName: 'Projection adjusted',
        entryId: entry.id,
        kind: 'adjustment',
        confirmed: false,
        projected: event.date > todayIso,
      });
      continue;
    }

    if (seenIncomeIds.has(event.entry.id)) continue;
    seenIncomeIds.add(event.entry.id);
    totalIncome += event.entry.amount;
    points.push({
      date: event.date,
      totalIncome: Number(totalIncome.toFixed(2)),
      incomeAdded: Number(event.entry.amount.toFixed(2)),
      sourceName: event.entry.sourceName,
      entryId: event.entry.id,
      kind: 'income',
      confirmed: event.entry.status === 'received',
      projected: event.date > todayIso || event.entry.status === 'expected',
    });
  }

  const dates = new Set(points.map((point) => point.date));
  if (!dates.has(todayIso) && todayIso >= start && todayIso <= horizonEnd) {
    points.push({
      date: todayIso,
      totalIncome: Number(totalIncome.toFixed(2)),
      incomeAdded: 0,
      kind: 'anchor',
      confirmed: true,
      projected: false,
    });
  }

  if (!dates.has(horizonEnd) && points[points.length - 1]?.date !== horizonEnd) {
    points.push({
      date: horizonEnd,
      totalIncome: Number(totalIncome.toFixed(2)),
      incomeAdded: 0,
      kind: 'anchor',
      confirmed: true,
      projected: horizonEnd > todayIso,
    });
  }

  points.sort((a, b) => a.date.localeCompare(b.date) || a.incomeAdded - b.incomeAdded);

  return { points, cutoffDate, horizonEnd };
}
