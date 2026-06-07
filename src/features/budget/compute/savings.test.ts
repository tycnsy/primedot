import { describe, expect, it } from 'vitest';
import type { SavingsGoal } from '../types';
import { savingsProjection } from './savings';

function goal(partial: Partial<SavingsGoal> & Pick<SavingsGoal, 'targetAmount' | 'contributedAmount'>): SavingsGoal {
  return {
    id: 'g',
    userId: 'u',
    name: 'Fund',
    sortOrder: 0,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('savingsProjection', () => {
  it('computes progress and remaining', () => {
    const result = savingsProjection(goal({ targetAmount: 1000, contributedAmount: 250 }), new Date('2026-02-01T00:00:00Z'));
    expect(result.pct).toBeCloseTo(0.25, 5);
    expect(result.remaining).toBe(750);
    expect(result.complete).toBe(false);
  });

  it('flags a fully funded goal', () => {
    const result = savingsProjection(goal({ targetAmount: 1000, contributedAmount: 1000 }));
    expect(result.complete).toBe(true);
    expect(result.projectedDate).toBeNull();
  });

  it('projects a completion date from the contribution rate', () => {
    // ~1 month elapsed, contributed 500 -> rate ~500/mo, 500 remaining -> ~1 month out.
    const result = savingsProjection(
      goal({ targetAmount: 1000, contributedAmount: 500 }),
      new Date('2026-01-31T00:00:00Z'),
    );
    expect(result.monthlyRate).toBeGreaterThan(0);
    expect(result.projectedDate).not.toBeNull();
  });
});
