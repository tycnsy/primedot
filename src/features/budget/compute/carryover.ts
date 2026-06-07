import type { MonthlyBudget } from './budgetMath';
import type { Category } from '../types';
import { compareMonths, monthKey } from './dates';

/**
 * Per-category carry-over for the next month = each category's remaining
 * (effective budget minus spend). Unspent budget is positive, overspend is
 * negative; both carry forward per the module spec.
 */
export function carryOverByCategory(prev: MonthlyBudget): Record<string, number> {
  const map: Record<string, number> = {};
  for (const category of prev.categories) {
    map[category.categoryId] = Number(category.remaining.toFixed(2));
  }
  return map;
}

/** Net carry-over stored on the new period record. */
export function netCarryOver(prev: MonthlyBudget): number {
  return Number(
    prev.categories.reduce((sum, category) => sum + category.remaining, 0).toFixed(2),
  );
}

/**
 * Future months inherit only overspend debt from the prior month; positive
 * remainings do not carry forward into planning months.
 */
export function carryOverForTargetMonth(
  prev: MonthlyBudget,
  targetMonth: string,
  currentMonth: string,
): Record<string, number> {
  const raw = carryOverByCategory(prev);
  if (compareMonths(targetMonth, currentMonth) <= 0) return raw;
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => value < 0));
}

/**
 * When a category branches at `targetMonth`, carry-over from the prior leg (same
 * name + sort order, archived at `targetMonth`) should apply to the new leg.
 */
export function remapBranchCarryOver(
  carryMap: Record<string, number>,
  targetMonth: string,
  activeCategories: Category[],
  allCategories: Category[],
): Record<string, number> {
  const result = { ...carryMap };
  const key = monthKey(targetMonth);

  for (const category of activeCategories) {
    if (monthKey(category.createdAt) !== key) continue;
    const predecessor = allCategories.find(
      (candidate) =>
        candidate.id !== category.id &&
        candidate.name === category.name &&
        candidate.sortOrder === category.sortOrder &&
        candidate.archivedAt !== null &&
        monthKey(candidate.archivedAt) === key,
    );
    if (!predecessor || !(predecessor.id in result)) continue;
    result[category.id] = result[predecessor.id]!;
    delete result[predecessor.id];
  }

  return result;
}
