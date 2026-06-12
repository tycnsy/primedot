import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import type { CategoryBudget } from './budgetMath';
import {
  categorySpendOnDay,
  computeCategoryDailyState,
  computeDailySpendingView,
  endOfDayBalance,
  spendingComparisonDate,
} from './dailySpending';

function categoryBudget(
  partial: Partial<CategoryBudget> & Pick<CategoryBudget, 'categoryId' | 'effectiveBudget'>,
): CategoryBudget {
  return {
    name: 'Groceries',
    budgetType: 'flat',
    isFixed: false,
    configuredValue: partial.effectiveBudget,
    budgeted: partial.effectiveBudget,
    carryOver: 0,
    spent: 0,
    remaining: partial.effectiveBudget,
    pctUsed: 0,
    status: 'under',
    ...partial,
  };
}

function txn(
  amount: number,
  type: Transaction['type'],
  categoryId: string,
  date: string,
): Transaction {
  return {
    id: Math.random().toString(36),
    userId: 'u',
    accountId: 'a',
    categoryId,
    amount,
    date,
    type,
    budgetOnly: false,
    reimbursable: false,
    reimbursementStatus: 'none',
    createdAt: `${date}T00:00:00Z`,
  };
}

describe('categorySpendOnDay', () => {
  it('adds debits and subtracts credits for the day', () => {
    const txns = [
      txn(40, 'debit', 'c1', '2026-01-05'),
      txn(10, 'credit', 'c1', '2026-01-05'),
      txn(50, 'debit', 'c1', '2026-01-06'),
    ];
    expect(categorySpendOnDay('c1', '2026-01-05', txns)).toBe(30);
  });
});

describe('endOfDayBalance / rollover', () => {
  const month = '2026-04-01'; // 30 days → $25/day on $750 budget
  const effectiveBudget = 750;

  it('user example: over by $100 on day 5 → day 6 available is -$75', () => {
    const categoryId = 'c1';
    // 5 days × $25 = $125 allowance; spend $225 → -$100 end of day 5
    const transactions = [txn(225, 'debit', categoryId, '2026-04-05')];

    const day5Balance = endOfDayBalance({
      effectiveBudget,
      month,
      dayIndex: 5,
      categoryId,
      transactions,
    });
    expect(day5Balance).toBe(-100);

    const state = computeCategoryDailyState({
      categoryBudget: categoryBudget({ categoryId, effectiveBudget }),
      month,
      selectedDay: '2026-04-06',
      transactions,
    });
    expect(state.rollover).toBe(-100);
    expect(state.allowance).toBe(25);
    expect(state.available).toBe(-75);
  });

  it('carry-over in effective budget lowers daily rate', () => {
    const categoryId = 'c1';
    const withDebt = categoryBudget({
      categoryId,
      effectiveBudget: 500,
      carryOver: -100,
      budgeted: 600,
    });
    const state = computeCategoryDailyState({
      categoryBudget: withDebt,
      month: '2026-01-01',
      selectedDay: '2026-01-01',
      transactions: [],
    });
    expect(state.dailyRate).toBeCloseTo(500 / 31, 2);
    expect(state.available).toBeCloseTo(500 / 31, 2);
  });
});

describe('computeDailySpendingView', () => {
  it('aggregates totals across categories', () => {
    const view = computeDailySpendingView({
      month: '2026-01-01',
      selectedDay: '2026-01-01',
      categoryBudgets: [
        categoryBudget({ categoryId: 'c1', effectiveBudget: 310 }),
        categoryBudget({ categoryId: 'c2', effectiveBudget: 310 }),
      ],
      transactions: [txn(20, 'debit', 'c1', '2026-01-01')],
    });
    expect(view.categories).toHaveLength(2);
    expect(view.totalSpentToday).toBe(20);
    expect(view.totalAvailable).toBeGreaterThan(0);
  });
});

describe('spendingComparisonDate', () => {
  it('returns last day for past months', () => {
    expect(spendingComparisonDate('2026-01-01', '2026-03-01', '2026-03-10')).toBe('2026-01-31');
  });

  it('returns today for current month', () => {
    expect(spendingComparisonDate('2026-03-01', '2026-03-01', '2026-03-10')).toBe('2026-03-10');
  });

  it('returns null for future months', () => {
    expect(spendingComparisonDate('2026-04-01', '2026-03-01', '2026-03-10')).toBeNull();
  });
});
