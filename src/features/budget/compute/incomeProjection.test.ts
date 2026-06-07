import { describe, expect, it } from 'vitest';
import type { IncomeEntry } from '../types';
import {
  cutoffIncomeTotal,
  projectMonthlyIncome,
  projectSourceIncomeHistory,
} from './incomeProjection';

function income(
  amount: number,
  expectedDate: string,
  status: IncomeEntry['status'] = 'expected',
  partial: Partial<IncomeEntry> = {},
): IncomeEntry {
  return {
    id: partial.id ?? Math.random().toString(36),
    userId: 'u',
    sourceName: partial.sourceName ?? 'Job',
    amount,
    expectedDate,
    earnedMonth: partial.earnedMonth ?? `${expectedDate.slice(0, 7)}-01`,
    status,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('projectMonthlyIncome', () => {
  it('starts each month at zero and includes a month-end point', () => {
    const points = projectMonthlyIncome({
      incomeEntries: [],
      month: '2026-01-01',
      today: '2026-01-01',
    });
    expect(points).toHaveLength(2);
    expect(points[0].date).toBe('2026-01-01');
    expect(points[0].totalIncome).toBe(0);
    expect(points[1].date).toBe('2026-01-31');
    expect(points[1].totalIncome).toBe(0);
  });

  it('adds a today anchor when income is still in the future', () => {
    const points = projectMonthlyIncome({
      incomeEntries: [income(10542.49, '2026-06-22')],
      month: '2026-06-01',
      today: '2026-06-06',
    });

    const todayPoint = points.find((point) => point.date === '2026-06-06');
    const incomePoint = points.find((point) => point.date === '2026-06-22');
    expect(todayPoint?.totalIncome).toBe(0);
    expect(incomePoint?.totalIncome).toBe(10542.49);
    expect(points[points.length - 1].date).toBe('2026-06-30');
  });

  it('layers income on expected dates and tracks cumulative monthly income', () => {
    const points = projectMonthlyIncome({
      incomeEntries: [income(2000, '2026-01-15', 'received'), income(500, '2026-01-20')],
      month: '2026-01-01',
      today: '2026-01-01',
    });
    const jan15 = points.find((p) => p.date === '2026-01-15');
    const jan20 = points.find((p) => p.date === '2026-01-20');
    expect(jan15?.totalIncome).toBe(2000);
    expect(jan15?.confirmed).toBe(true);
    expect(jan20?.totalIncome).toBe(2500);
    expect(jan20?.confirmed).toBe(false);
    expect(jan20?.sourceName).toBe('Job');
  });
});

describe('projectSourceIncomeHistory', () => {
  it('extends the chart through month end and keeps cutoff separate for received entries', () => {
    const receivedEntry: IncomeEntry = {
      ...income(300, '2026-01-15', 'received'),
      id: 'received-entry',
      sourceName: 'Contract',
      createdAt: '2026-01-01T00:00:00Z',
      receivedDate: '2026-01-18',
    };

    const { points, cutoffDate, horizonEnd } = projectSourceIncomeHistory({
      entry: receivedEntry,
      incomeEntries: [
        receivedEntry,
        {
          ...income(450, '2026-01-25', 'expected'),
          id: 'future-entry',
          sourceName: 'Contract',
          createdAt: '2026-01-03T00:00:00Z',
        },
      ],
      today: '2026-01-31',
    });

    expect(cutoffDate).toBe('2026-01-18');
    expect(horizonEnd).toBe('2026-01-31');
    expect(points[0].date).toBe('2026-01-01');
    expect(points.some((point) => point.date === '2026-01-31')).toBe(true);
    expect(points.some((point) => point.date === '2026-01-25')).toBe(true);
    expect(cutoffIncomeTotal(points, cutoffDate)).toBe(300);
  });

  it('spans same-day creation through month end with a future expected income point', () => {
    const entry: IncomeEntry = {
      ...income(500, '2026-06-30', 'expected'),
      id: 'adsense',
      sourceName: 'Adsense',
      createdAt: '2026-06-07T12:00:00Z',
    };

    const { points, horizonEnd } = projectSourceIncomeHistory({
      entry,
      incomeEntries: [entry],
      today: '2026-06-07',
    });

    expect(horizonEnd).toBe('2026-06-30');
    expect(points[0].date).toBe('2026-06-07');
    expect(points.some((point) => point.date === '2026-06-30' && point.kind === 'income')).toBe(
      true,
    );
    expect(new Set(points.map((point) => point.date)).size).toBeGreaterThan(1);
  });

  it('plots adjustment deltas for the selected entry', () => {
    const entry: IncomeEntry = {
      ...income(500, '2026-06-30', 'expected'),
      id: 'adsense',
      sourceName: 'Adsense',
      createdAt: '2026-06-07T12:00:00Z',
    };

    const { points } = projectSourceIncomeHistory({
      entry,
      incomeEntries: [entry],
      adjustments: [
        {
          id: 'adj-1',
          incomeEntryId: 'adsense',
          oldAmount: 400,
          newAmount: 500,
          adjustedAt: '2026-06-07T15:00:00Z',
        },
      ],
      today: '2026-06-07',
    });

    const adjustment = points.find((point) => point.kind === 'adjustment');
    expect(adjustment?.incomeAdded).toBe(100);
    expect(adjustment?.sourceName).toBe('Projection adjusted');
  });
});
