import type { SavingsGoal } from '../types';

export interface SavingsProjection {
  pct: number;
  remaining: number;
  /** Average contribution per month since the goal was created. */
  monthlyRate: number;
  /** Estimated completion date (ISO) or null when not projectable. */
  projectedDate: string | null;
  /** Whether the goal is already fully funded. */
  complete: boolean;
}

const MS_PER_DAY = 86_400_000;

export function savingsProjection(goal: SavingsGoal, now: Date = new Date()): SavingsProjection {
  const remaining = Math.max(0, goal.targetAmount - goal.contributedAmount);
  const pct =
    goal.targetAmount > 0
      ? Math.min(1, Math.max(0, goal.contributedAmount / goal.targetAmount))
      : 0;
  const complete = remaining <= 0;

  const created = new Date(goal.createdAt);
  const daysElapsed = Math.max(1, (now.getTime() - created.getTime()) / MS_PER_DAY);
  const monthsElapsed = Math.max(daysElapsed / 30, 1 / 30);
  const monthlyRate = goal.contributedAmount / monthsElapsed;

  let projectedDate: string | null = null;
  if (!complete && monthlyRate > 0) {
    const monthsToGo = remaining / monthlyRate;
    const projected = new Date(now.getTime() + monthsToGo * 30 * MS_PER_DAY);
    projectedDate = projected.toISOString().slice(0, 10);
  }

  return { pct, remaining, monthlyRate, projectedDate, complete };
}
