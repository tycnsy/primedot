import { describe, expect, it } from 'vitest';
import type { MonthlyBudget } from './budgetMath';
import type { Category } from '../types';
import { carryOverForTargetMonth, remapBranchCarryOver } from './carryover';

function budget(categories: MonthlyBudget['categories']): MonthlyBudget {
  return {
    totalIncome: 0,
    fixedTotal: 0,
    distributableBase: 0,
    totalBudgeted: 0,
    totalSpent: 0,
    totalRemaining: 0,
    netCarryOver: 0,
    categories,
  };
}

describe('carryOverForTargetMonth', () => {
  it('passes through all carry-overs for the current month', () => {
    const prev = budget([
      {
        categoryId: 'a',
        name: 'A',
        budgetType: 'flat',
        isFixed: false,
        configuredValue: 100,
        budgeted: 100,
        carryOver: 0,
        effectiveBudget: 100,
        spent: 0,
        remaining: 50,
        pctUsed: 0,
        status: 'under',
      },
      {
        categoryId: 'b',
        name: 'B',
        budgetType: 'flat',
        isFixed: false,
        configuredValue: 100,
        budgeted: 100,
        carryOver: 0,
        effectiveBudget: 100,
        spent: 0,
        remaining: -20,
        pctUsed: 0,
        status: 'over',
      },
    ]);

    const result = carryOverForTargetMonth(prev, '2026-06-01', '2026-06-01');
    expect(result).toEqual({ a: 50, b: -20 });
  });

  it('keeps only negative carry-overs for future months', () => {
    const prev = budget([
      {
        categoryId: 'a',
        name: 'A',
        budgetType: 'flat',
        isFixed: false,
        configuredValue: 100,
        budgeted: 100,
        carryOver: 0,
        effectiveBudget: 100,
        spent: 0,
        remaining: 50,
        pctUsed: 0,
        status: 'under',
      },
      {
        categoryId: 'b',
        name: 'B',
        budgetType: 'flat',
        isFixed: false,
        configuredValue: 100,
        budgeted: 100,
        carryOver: 0,
        effectiveBudget: 100,
        spent: 0,
        remaining: -20,
        pctUsed: 0,
        status: 'over',
      },
    ]);

    const result = carryOverForTargetMonth(prev, '2026-07-01', '2026-06-01');
    expect(result).toEqual({ b: -20 });
  });
});

function category(overrides: Partial<Category> & Pick<Category, 'id' | 'name'>): Category {
  return {
    userId: 'user',
    budgetType: 'flat',
    budgetValue: 100,
    isFixed: false,
    sortOrder: 0,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('remapBranchCarryOver', () => {
  it('moves carry-over from a predecessor leg to the branched leg', () => {
    const oldLeg = category({
      id: 'old',
      name: 'Groceries',
      sortOrder: 1,
      archivedAt: '2026-07-01T00:00:00.000Z',
    });
    const newLeg = category({
      id: 'new',
      name: 'Groceries',
      sortOrder: 1,
      createdAt: '2026-07-01T00:00:00.000Z',
    });

    const result = remapBranchCarryOver(
      { old: -15 },
      '2026-07-01',
      [newLeg],
      [oldLeg, newLeg],
    );

    expect(result).toEqual({ new: -15 });
  });
});
