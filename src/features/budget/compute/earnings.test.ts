import { describe, expect, it } from 'vitest';
import type { IncomeEntry, MonthlyEarningsSnapshot } from '../types';
import {
  buildMonthlyEarningsChartData,
  earningsForMonth,
  earningsPaceDelta,
  earnedMonthFromInput,
  earnedMonthToInput,
  entriesByEarnedMonth,
  goalPaceAtDate,
  latestSnapshotPerDay,
  paceComparisonDate,
} from './earnings';

function entry(partial: Partial<IncomeEntry> & Pick<IncomeEntry, 'id'>): IncomeEntry {
  return {
    userId: 'u1',
    sourceName: 'Pay',
    amount: 1000,
    expectedDate: '2026-03-15',
    earnedMonth: '2026-02-01',
    status: 'expected',
    createdAt: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('earningsForMonth', () => {
  it('sums income by earned month, not expected date', () => {
    const entries = [
      entry({ id: '1', amount: 2000, earnedMonth: '2026-02-01', expectedDate: '2026-03-01' }),
      entry({ id: '2', amount: 500, earnedMonth: '2026-03-01', expectedDate: '2026-03-15' }),
    ];
    expect(earningsForMonth('2026-02-01', entries)).toBe(2000);
    expect(earningsForMonth('2026-03-01', entries)).toBe(500);
  });
});

describe('entriesByEarnedMonth', () => {
  it('groups entries by earned month', () => {
    const entries = [
      entry({ id: '1', earnedMonth: '2026-01-01' }),
      entry({ id: '2', earnedMonth: '2026-02-01' }),
      entry({ id: '3', earnedMonth: '2026-01-01' }),
    ];
    const map = entriesByEarnedMonth(entries);
    expect(map.get('2026-01-01')).toHaveLength(2);
    expect(map.get('2026-02-01')).toHaveLength(1);
  });
});

describe('latestSnapshotPerDay', () => {
  it('keeps only the latest snapshot when multiple fall on the same day', () => {
    const snapshots: MonthlyEarningsSnapshot[] = [
      {
        id: 's1',
        userId: 'u1',
        earnedMonth: '2026-02-01',
        totalAmount: 2500,
        recordedAt: '2026-02-10T09:00:00Z',
      },
      {
        id: 's2',
        userId: 'u1',
        earnedMonth: '2026-02-01',
        totalAmount: 3000,
        recordedAt: '2026-02-10T18:00:00Z',
      },
      {
        id: 's3',
        userId: 'u1',
        earnedMonth: '2026-02-01',
        totalAmount: 3200,
        recordedAt: '2026-02-20T12:00:00Z',
      },
    ];

    const points = latestSnapshotPerDay(snapshots);
    expect(points).toHaveLength(2);
    expect(points[0].id).toBe('s2');
    expect(points[0].totalAmount).toBe(3000);
    expect(points[1].id).toBe('s3');
  });
});

describe('buildMonthlyEarningsChartData', () => {
  it('scopes chart data to a single earned month with day-based points', () => {
    const snapshots: MonthlyEarningsSnapshot[] = [
      {
        id: 's1',
        userId: 'u1',
        earnedMonth: '2026-02-01',
        totalAmount: 2500,
        recordedAt: '2026-02-10T00:00:00Z',
      },
      {
        id: 's2',
        userId: 'u1',
        earnedMonth: '2026-03-01',
        totalAmount: 9000,
        recordedAt: '2026-03-05T00:00:00Z',
      },
    ];

    const data = buildMonthlyEarningsChartData({
      snapshots,
      month: '2026-02-01',
      goalAmount: 4000,
    });

    expect(data.month).toBe('2026-02-01');
    expect(data.monthStart).toBe('2026-02-01');
    expect(data.monthEnd).toBe('2026-02-28');
    expect(data.points).toHaveLength(1);
    expect(data.points[0].totalAmount).toBe(2500);
    expect(data.goalAmount).toBe(4000);
  });
});

describe('earned month input helpers', () => {
  it('converts between input and storage formats', () => {
    expect(earnedMonthFromInput('2026-03')).toBe('2026-03-01');
    expect(earnedMonthToInput('2026-03-01')).toBe('2026-03');
  });
});

describe('goalPaceAtDate', () => {
  it('returns half the goal at mid-month for a 30-day month', () => {
    expect(goalPaceAtDate('2026-06-01', 10000, '2026-06-15')).toBe(5000);
  });

  it('returns the full goal on the last day', () => {
    expect(goalPaceAtDate('2026-06-01', 10000, '2026-06-30')).toBe(10000);
  });
});

describe('paceComparisonDate', () => {
  it('uses today for the current month', () => {
    expect(paceComparisonDate('2026-06-01', '2026-06-01', '2026-06-06')).toBe('2026-06-06');
  });

  it('uses month end for past months', () => {
    expect(paceComparisonDate('2026-05-01', '2026-06-01', '2026-06-06')).toBe('2026-05-31');
  });

  it('returns null for future months', () => {
    expect(paceComparisonDate('2026-07-01', '2026-06-01', '2026-06-06')).toBeNull();
  });
});

describe('earningsPaceDelta', () => {
  it('computes delta against expected pace', () => {
    expect(earningsPaceDelta(6000, 10000, '2026-06-15', '2026-06-01')).toBe(1000);
  });
});
