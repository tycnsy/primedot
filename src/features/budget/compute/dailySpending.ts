import type { CategoryBudget, BudgetStatus } from './budgetMath';
import type { Transaction } from '../types';
import { compareMonths, eachDayOfMonth, isInMonth, monthBounds, monthKey } from './dates';

const NEAR_THRESHOLD = 0.85;

export interface CategoryDailyState {
  categoryId: string;
  name: string;
  budgetType: CategoryBudget['budgetType'];
  isFixed: boolean;
  effectiveBudget: number;
  dailyRate: number;
  /** Balance at end of the prior day (rollover into selected day). */
  rollover: number;
  /** Daily allowance accrued at midnight on the selected day. */
  allowance: number;
  /** rollover + allowance (available before today's spend). */
  available: number;
  spentToday: number;
  /** End-of-day balance for the selected day. */
  balance: number;
  pctUsed: number;
  status: BudgetStatus;
}

export interface DailySpendingView {
  month: string;
  selectedDay: string;
  categories: CategoryDailyState[];
  totalAvailable: number;
  totalSpentToday: number;
  totalBalance: number;
  categoriesOverPace: number;
}

/** Actual spend for a category on a single calendar day. */
export function categorySpendOnDay(
  categoryId: string,
  date: string,
  transactions: Transaction[],
): number {
  return transactions.reduce((sum, txn) => {
    if (txn.categoryId !== categoryId) return sum;
    if (txn.date !== date) return sum;
    if (txn.type === 'debit') return sum + txn.amount;
    if (txn.type === 'credit') return sum - txn.amount;
    return sum;
  }, 0);
}

function daysInMonth(month: string): number {
  return eachDayOfMonth(monthKey(month)).length;
}

function statusFor(spent: number, available: number, dailyRate: number): BudgetStatus {
  const basis = available > 0 ? available : dailyRate > 0 ? dailyRate : 0;
  if (basis <= 0) return spent > 0 ? 'over' : 'under';
  const ratio = spent / basis;
  if (ratio > 1) return 'over';
  if (ratio >= NEAR_THRESHOLD) return 'near';
  return 'under';
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

/** End-of-day balance after processing days 1..dayIndex (1-based). */
export function endOfDayBalance(args: {
  effectiveBudget: number;
  month: string;
  dayIndex: number;
  categoryId: string;
  transactions: Transaction[];
}): number {
  const { effectiveBudget, month, dayIndex, categoryId, transactions } = args;
  if (dayIndex <= 0) return 0;

  const days = daysInMonth(month);
  const dailyRate = effectiveBudget / days;
  const monthDays = eachDayOfMonth(month);

  let balance = 0;
  for (let i = 0; i < dayIndex; i += 1) {
    const day = monthDays[i]!;
    const spent = categorySpendOnDay(categoryId, day, transactions);
    balance = balance + dailyRate - spent;
  }
  return roundMoney(balance);
}

export function computeCategoryDailyState(args: {
  categoryBudget: CategoryBudget;
  month: string;
  selectedDay: string;
  transactions: Transaction[];
}): CategoryDailyState {
  const { categoryBudget, month, selectedDay, transactions } = args;
  const monthDays = eachDayOfMonth(month);
  const dayIndex = monthDays.indexOf(selectedDay);
  if (dayIndex < 0) {
    throw new Error(`Selected day ${selectedDay} is not in month ${month}`);
  }

  const days = daysInMonth(month);
  const dailyRate = roundMoney(categoryBudget.effectiveBudget / days);
  const rollover =
    dayIndex === 0 ? 0 : endOfDayBalance({
      effectiveBudget: categoryBudget.effectiveBudget,
      month,
      dayIndex,
      categoryId: categoryBudget.categoryId,
      transactions,
    });
  const allowance = dailyRate;
  const available = roundMoney(rollover + allowance);
  const spentToday = roundMoney(
    categorySpendOnDay(categoryBudget.categoryId, selectedDay, transactions),
  );
  const balance = roundMoney(available - spentToday);
  const pctUsed =
    available > 0 ? spentToday / available : spentToday > 0 ? 1 : 0;

  return {
    categoryId: categoryBudget.categoryId,
    name: categoryBudget.name,
    budgetType: categoryBudget.budgetType,
    isFixed: categoryBudget.isFixed,
    effectiveBudget: categoryBudget.effectiveBudget,
    dailyRate,
    rollover,
    allowance,
    available,
    spentToday,
    balance,
    pctUsed,
    status: statusFor(spentToday, available, dailyRate),
  };
}

/** Date used when viewing daily spending for a month (clamped to month bounds). */
export function spendingComparisonDate(
  viewedMonth: string,
  currentMonth: string,
  todayEst: string,
): string | null {
  const viewed = monthKey(viewedMonth);
  const current = monthKey(currentMonth);
  const cmp = compareMonths(viewed, current);
  if (cmp > 0) return null;
  const { start, end } = monthBounds(viewed);
  if (cmp < 0) return end;
  if (todayEst < start) return start;
  if (todayEst > end) return end;
  return todayEst;
}

export function computeDailySpendingView(args: {
  month: string;
  selectedDay: string;
  categoryBudgets: CategoryBudget[];
  transactions: Transaction[];
}): DailySpendingView {
  const categories = args.categoryBudgets.map((categoryBudget) =>
    computeCategoryDailyState({
      categoryBudget,
      month: args.month,
      selectedDay: args.selectedDay,
      transactions: args.transactions,
    }),
  );

  const totalAvailable = roundMoney(categories.reduce((sum, c) => sum + c.available, 0));
  const totalSpentToday = roundMoney(categories.reduce((sum, c) => sum + c.spentToday, 0));
  const totalBalance = roundMoney(categories.reduce((sum, c) => sum + c.balance, 0));
  const categoriesOverPace = categories.filter((c) => c.balance < 0).length;

  return {
    month: monthKey(args.month),
    selectedDay: args.selectedDay,
    categories,
    totalAvailable,
    totalSpentToday,
    totalBalance,
    categoriesOverPace,
  };
}

/** True when `date` belongs to `month` (for day picker bounds). */
export function isDayInMonth(date: string, month: string): boolean {
  return isInMonth(date, month);
}
