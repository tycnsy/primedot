import type { Category, IncomeEntry, Transaction } from '../types';
import { compareMonths, isInMonth, monthKey } from './dates';

export type BudgetStatus = 'under' | 'near' | 'over';
export type IncomeMode = 'expected' | 'received';

export interface CategoryBudget {
  categoryId: string;
  name: string;
  budgetType: Category['budgetType'];
  isFixed: boolean;
  /** Raw configured value from category (flat currency or percent). */
  configuredValue: number;
  /** Base budget before carry-over (flat amount or % of distributable base). */
  budgeted: number;
  /** Carry-over applied from the prior month for this category. */
  carryOver: number;
  /** budgeted + carryOver. */
  effectiveBudget: number;
  spent: number;
  remaining: number;
  pctUsed: number;
  status: BudgetStatus;
}

export interface MonthlyBudget {
  totalIncome: number;
  fixedTotal: number;
  distributableBase: number;
  totalBudgeted: number;
  totalSpent: number;
  totalRemaining: number;
  netCarryOver: number;
  categories: CategoryBudget[];
}

export interface ComputeMonthlyBudgetArgs {
  month: string;
  categories: Category[];
  incomeEntries: IncomeEntry[];
  transactions: Transaction[];
  /** Per-category carry-over from the prior month (remaining; may be negative). */
  carryOverByCategory?: Record<string, number>;
  incomeMode?: IncomeMode;
  /** Planning month: projected income, negative distributable allowed. */
  isFutureMonth?: boolean;
}

const NEAR_THRESHOLD = 0.85;

export function isCategoryActiveInMonth(category: Category, month: string): boolean {
  const targetMonth = month.slice(0, 7);
  const createdMonth = category.createdAt.slice(0, 7);
  if (targetMonth < createdMonth) return false;
  if (!category.archivedAt) return true;
  const archivedMonth = category.archivedAt.slice(0, 7);
  // Archive month is the first month the category no longer exists.
  return targetMonth < archivedMonth;
}

/** True when an edit in `month` should fork a new category leg instead of mutating history. */
export function shouldBranchCategoryAtMonth(category: Category, month: string): boolean {
  return compareMonths(monthKey(category.createdAt), month) < 0;
}

function statusFor(spent: number, effectiveBudget: number): BudgetStatus {
  if (effectiveBudget <= 0) return spent > 0 ? 'over' : 'under';
  const ratio = spent / effectiveBudget;
  if (ratio > 1) return 'over';
  if (ratio >= NEAR_THRESHOLD) return 'near';
  return 'under';
}

/** Actual spend for a category in the month: debits add, credits (refunds) subtract. */
export function categorySpend(
  categoryId: string,
  month: string,
  transactions: Transaction[],
): number {
  return transactions.reduce((sum, txn) => {
    if (txn.categoryId !== categoryId) return sum;
    if (!isInMonth(txn.date, month)) return sum;
    if (txn.type === 'debit') return sum + txn.amount;
    if (txn.type === 'credit') return sum - txn.amount;
    return sum;
  }, 0);
}

export function incomeForMonth(
  month: string,
  incomeEntries: IncomeEntry[],
  mode: IncomeMode = 'expected',
): number {
  return incomeEntries.reduce((sum, entry) => {
    if (!isInMonth(entry.expectedDate, month)) return sum;
    if (mode === 'received' && entry.status !== 'received') return sum;
    return sum + entry.amount;
  }, 0);
}

/**
 * Implements the monthly budget algorithm:
 * 1. Sum income for the month.
 * 2. Subtract all flat-budget categories -> distributable base.
 * 3. Each percentage category gets budget_value% of the distributable base.
 * 4. Apply per-category carry-over to get the effective budget.
 * 5. Compare effective budget against actual spend.
 */
export function computeMonthlyBudget({
  month,
  categories,
  incomeEntries,
  transactions,
  carryOverByCategory = {},
  incomeMode = 'expected',
  isFutureMonth = false,
}: ComputeMonthlyBudgetArgs): MonthlyBudget {
  const active = categories.filter((category) => isCategoryActiveInMonth(category, month));
  const effectiveIncomeMode = isFutureMonth ? 'expected' : incomeMode;
  const totalIncome = incomeForMonth(month, incomeEntries, effectiveIncomeMode);

  const flatCategories = active.filter((category) => category.budgetType === 'flat');
  const percentageCategories = active.filter(
    (category) => category.budgetType === 'percentage',
  );

  const fixedTotal = flatCategories.reduce((sum, category) => sum + category.budgetValue, 0);
  const rawDistributable = totalIncome - fixedTotal;
  const distributableBase = isFutureMonth
    ? rawDistributable
    : Math.max(0, rawDistributable);
  const percentageBase = Math.max(0, distributableBase);

  const categoryBudgets: CategoryBudget[] = active.map((category) => {
    const budgeted =
      category.budgetType === 'flat'
        ? category.budgetValue
        : (category.budgetValue / 100) * percentageBase;
    const carryOver = carryOverByCategory[category.id] ?? 0;
    const effectiveBudget = budgeted + carryOver;
    const spent = categorySpend(category.id, month, transactions);
    const remaining = effectiveBudget - spent;
    const pctUsed = effectiveBudget > 0 ? spent / effectiveBudget : spent > 0 ? 1 : 0;
    return {
      categoryId: category.id,
      name: category.name,
      budgetType: category.budgetType,
      isFixed: category.isFixed,
      configuredValue: category.budgetValue,
      budgeted,
      carryOver,
      effectiveBudget,
      spent,
      remaining,
      pctUsed,
      status: statusFor(spent, effectiveBudget),
    };
  });

  const totalBudgeted = categoryBudgets.reduce((sum, c) => sum + c.effectiveBudget, 0);
  const totalSpent = categoryBudgets.reduce((sum, c) => sum + c.spent, 0);
  const netCarryOver = categoryBudgets.reduce((sum, c) => sum + c.carryOver, 0);

  return {
    totalIncome,
    fixedTotal,
    distributableBase,
    totalBudgeted,
    totalSpent,
    totalRemaining: totalBudgeted - totalSpent,
    netCarryOver,
    categories: percentageCategories.length + flatCategories.length === 0 ? [] : categoryBudgets,
  };
}

export function percentageAllocationTotal(categories: Category[], month: string): number {
  return categories
    .filter(
      (category) =>
        isCategoryActiveInMonth(category, month) && category.budgetType === 'percentage',
    )
    .reduce((sum, category) => sum + category.budgetValue, 0);
}

export type PercentageAllocationResult =
  | { ok: true; remaining: number }
  | { ok: false; remaining: number };

export function validatePercentageAllocation(
  categories: Category[],
  month: string,
  proposedPercent: number,
  excludeCategoryId?: string,
): PercentageAllocationResult {
  const othersTotal = categories
    .filter(
      (category) =>
        isCategoryActiveInMonth(category, month) &&
        category.budgetType === 'percentage' &&
        category.id !== excludeCategoryId,
    )
    .reduce((sum, category) => sum + category.budgetValue, 0);

  const newTotal = othersTotal + proposedPercent;
  if (newTotal > 100) {
    return { ok: false, remaining: 100 - othersTotal };
  }
  return { ok: true, remaining: 100 - newTotal };
}
