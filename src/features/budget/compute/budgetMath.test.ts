import { describe, expect, it } from 'vitest';
import type { Category, IncomeEntry, Transaction } from '../types';
import {
  computeMonthlyBudget,
  categorySpend,
  incomeForMonth,
  percentageAllocationTotal,
  shouldBranchCategoryAtMonth,
  validatePercentageAllocation,
} from './budgetMath';

function category(partial: Partial<Category> & Pick<Category, 'id' | 'budgetType' | 'budgetValue'>): Category {
  return {
    userId: 'u',
    name: 'Cat',
    isFixed: false,
    sortOrder: 0,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

function income(amount: number, expectedDate: string, status: IncomeEntry['status'] = 'expected'): IncomeEntry {
  return {
    id: Math.random().toString(36),
    userId: 'u',
    sourceName: 'Job',
    amount,
    expectedDate,
    earnedMonth: `${expectedDate.slice(0, 7)}-01`,
    status,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

function txn(
  amount: number,
  type: Transaction['type'],
  categoryId: string,
  date = '2026-01-15',
  budgetOnly = false,
): Transaction {
  return {
    id: Math.random().toString(36),
    userId: 'u',
    accountId: 'a',
    categoryId,
    amount,
    date,
    type,
    budgetOnly,
    reimbursable: false,
    reimbursementStatus: 'none',
    createdAt: `${date}T00:00:00Z`,
  };
}

describe('incomeForMonth', () => {
  it('sums income within the month', () => {
    const entries = [income(2000, '2026-01-01'), income(500, '2026-02-01')];
    expect(incomeForMonth('2026-01-01', entries)).toBe(2000);
  });

  it('only counts received income in received mode', () => {
    const entries = [income(2000, '2026-01-01', 'received'), income(500, '2026-01-15')];
    expect(incomeForMonth('2026-01-01', entries, 'received')).toBe(2000);
  });
});

describe('categorySpend', () => {
  it('adds debits and subtracts credits in the month', () => {
    const txns = [
      txn(100, 'debit', 'c1'),
      txn(30, 'credit', 'c1'),
      txn(50, 'debit', 'c1', '2026-02-02'),
    ];
    expect(categorySpend('c1', '2026-01-01', txns)).toBe(70);
  });

  it('includes budget-only debits in monthly category spend', () => {
    const txns = [txn(80, 'debit', 'c1', '2026-01-10', true)];
    expect(categorySpend('c1', '2026-01-01', txns)).toBe(80);
  });
});

describe('computeMonthlyBudget', () => {
  it('subtracts flat categories then distributes percentages', () => {
    const categories = [
      category({ id: 'rent', budgetType: 'flat', budgetValue: 1000, isFixed: true }),
      category({ id: 'food', budgetType: 'percentage', budgetValue: 50 }),
      category({ id: 'fun', budgetType: 'percentage', budgetValue: 25 }),
    ];
    const result = computeMonthlyBudget({
      month: '2026-01-01',
      categories,
      incomeEntries: [income(3000, '2026-01-01')],
      transactions: [],
    });

    expect(result.totalIncome).toBe(3000);
    expect(result.fixedTotal).toBe(1000);
    expect(result.distributableBase).toBe(2000);

    const food = result.categories.find((c) => c.categoryId === 'food');
    const fun = result.categories.find((c) => c.categoryId === 'fun');
    expect(food?.budgeted).toBe(1000); // 50% of 2000
    expect(fun?.budgeted).toBe(500); // 25% of 2000
  });

  it('applies per-category carry-over and computes status', () => {
    const categories = [category({ id: 'food', budgetType: 'flat', budgetValue: 200 })];
    const result = computeMonthlyBudget({
      month: '2026-01-01',
      categories,
      incomeEntries: [income(1000, '2026-01-01')],
      transactions: [txn(250, 'debit', 'food')],
      carryOverByCategory: { food: 100 },
    });

    const food = result.categories[0];
    expect(food.effectiveBudget).toBe(300); // 200 + 100 carry
    expect(food.spent).toBe(250);
    expect(food.remaining).toBe(50);
    expect(food.status).toBe('under'); // 250/300 = 0.83 -> below the 0.85 near band
  });

  it('flags overspending', () => {
    const categories = [category({ id: 'food', budgetType: 'flat', budgetValue: 100 })];
    const result = computeMonthlyBudget({
      month: '2026-01-01',
      categories,
      incomeEntries: [income(1000, '2026-01-01')],
      transactions: [txn(150, 'debit', 'food')],
    });
    expect(result.categories[0].status).toBe('over');
    expect(result.categories[0].remaining).toBe(-50);
  });

  it('includes a category only from its start month onward', () => {
    const categories = [
      category({
        id: 'gym',
        budgetType: 'flat',
        budgetValue: 80,
        createdAt: '2026-06-01T00:00:00Z',
      }),
    ];
    const may = computeMonthlyBudget({
      month: '2026-05-01',
      categories,
      incomeEntries: [income(1000, '2026-05-01')],
      transactions: [],
    });
    const june = computeMonthlyBudget({
      month: '2026-06-01',
      categories,
      incomeEntries: [income(1000, '2026-06-01')],
      transactions: [],
    });
    expect(may.categories).toHaveLength(0);
    expect(june.categories).toHaveLength(1);
  });

  it('allows negative distributable for future months', () => {
    const categories = [
      category({ id: 'rent', budgetType: 'flat', budgetValue: 2500, isFixed: true }),
    ];
    const result = computeMonthlyBudget({
      month: '2026-07-01',
      categories,
      incomeEntries: [income(2000, '2026-07-01')],
      transactions: [],
      isFutureMonth: true,
    });
    expect(result.distributableBase).toBe(-500);
  });

  it('uses expected income for future months even in received mode', () => {
    const categories = [category({ id: 'food', budgetType: 'flat', budgetValue: 100 })];
    const entries = [
      income(3000, '2026-07-01', 'expected'),
      income(1000, '2026-07-15', 'received'),
    ];
    const result = computeMonthlyBudget({
      month: '2026-07-01',
      categories,
      incomeEntries: entries,
      transactions: [],
      incomeMode: 'received',
      isFutureMonth: true,
    });
    expect(result.totalIncome).toBe(4000);
  });

  it('does not apply positive carry-over in future months via caller filter', () => {
    const categories = [category({ id: 'food', budgetType: 'flat', budgetValue: 200 })];
    const result = computeMonthlyBudget({
      month: '2026-07-01',
      categories,
      incomeEntries: [income(1000, '2026-07-01')],
      transactions: [],
      carryOverByCategory: { food: 100 },
      isFutureMonth: true,
    });
    expect(result.categories[0].carryOver).toBe(100);
    expect(result.categories[0].effectiveBudget).toBe(300);
  });

  it('keeps percentage budgets at zero when distributable is negative in future months', () => {
    const categories = [
      category({ id: 'rent', budgetType: 'flat', budgetValue: 2500, isFixed: true }),
      category({ id: 'fun', budgetType: 'percentage', budgetValue: 50 }),
    ];
    const result = computeMonthlyBudget({
      month: '2026-07-01',
      categories,
      incomeEntries: [income(2000, '2026-07-01')],
      transactions: [],
      isFutureMonth: true,
    });
    expect(result.distributableBase).toBe(-500);
    const fun = result.categories.find((c) => c.categoryId === 'fun');
    expect(fun?.budgeted).toBe(0);
  });

  it('keeps archived categories in past months only', () => {
    const categories = [
      category({
        id: 'rent',
        budgetType: 'flat',
        budgetValue: 1000,
        createdAt: '2026-01-01T00:00:00Z',
        archivedAt: '2026-06-01T00:00:00Z',
      }),
    ];
    const may = computeMonthlyBudget({
      month: '2026-05-01',
      categories,
      incomeEntries: [income(2000, '2026-05-01')],
      transactions: [],
    });
    const june = computeMonthlyBudget({
      month: '2026-06-01',
      categories,
      incomeEntries: [income(2000, '2026-06-01')],
      transactions: [],
    });
    expect(may.categories).toHaveLength(1);
    expect(june.categories).toHaveLength(0);
  });
});

describe('percentageAllocationTotal', () => {
  it('sums active percentage categories for the month', () => {
    const categories = [
      category({ id: 'food', budgetType: 'percentage', budgetValue: 50 }),
      category({ id: 'fun', budgetType: 'percentage', budgetValue: 25 }),
      category({ id: 'rent', budgetType: 'flat', budgetValue: 1000 }),
    ];
    expect(percentageAllocationTotal(categories, '2026-01-01')).toBe(75);
  });

  it('excludes categories not active in the month', () => {
    const categories = [
      category({
        id: 'gym',
        budgetType: 'percentage',
        budgetValue: 10,
        createdAt: '2026-06-01T00:00:00Z',
      }),
    ];
    expect(percentageAllocationTotal(categories, '2026-05-01')).toBe(0);
    expect(percentageAllocationTotal(categories, '2026-06-01')).toBe(10);
  });
});

describe('validatePercentageAllocation', () => {
  const categories = [
    category({ id: 'food', budgetType: 'percentage', budgetValue: 50 }),
    category({ id: 'fun', budgetType: 'percentage', budgetValue: 25 }),
  ];

  it('accepts when total stays at or under 100%', () => {
    expect(validatePercentageAllocation(categories, '2026-01-01', 25)).toEqual({
      ok: true,
      remaining: 0,
    });
  });

  it('rejects when total would exceed 100% and reports remaining headroom', () => {
    expect(validatePercentageAllocation(categories, '2026-01-01', 30)).toEqual({
      ok: false,
      remaining: 25,
    });
  });

  it('excludes the edited category when validating an update', () => {
    expect(
      validatePercentageAllocation(categories, '2026-01-01', 60, 'food'),
    ).toEqual({ ok: true, remaining: 15 });
    expect(
      validatePercentageAllocation(categories, '2026-01-01', 80, 'food'),
    ).toEqual({ ok: false, remaining: 75 });
  });
});

describe('shouldBranchCategoryAtMonth', () => {
  it('branches when the category started before the edited month', () => {
    const cat = category({
      id: 'a',
      budgetType: 'flat',
      budgetValue: 100,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(shouldBranchCategoryAtMonth(cat, '2026-07-01')).toBe(true);
  });

  it('updates in place when the category already starts in the edited month', () => {
    const cat = category({
      id: 'a',
      budgetType: 'flat',
      budgetValue: 100,
      createdAt: '2026-07-01T00:00:00.000Z',
    });
    expect(shouldBranchCategoryAtMonth(cat, '2026-07-01')).toBe(false);
  });
});
