import type { AccumulationGoal, Milestone, MilestoneGoal, TrendGoal } from './types';

const MS_PER_DAY = 86_400_000;

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function differenceInDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export interface TrendStats {
  last: number;
  first: number;
  totalDelta: number;
  progressDelta: number;
  pct: number;
  days: number;
  daysIn: number;
  expected: number;
  onPace: boolean;
  aheadBy: number;
}

export interface AccumulationStats {
  total: number;
  pct: number;
  remaining: number;
  days: number;
  daysIn: number;
  daysLeft: number;
  expected: number;
  onPace: boolean;
  pacePerDay: number;
}

export interface MilestoneStats {
  done: number;
  total: number;
  pct: number;
  next: Milestone | undefined;
}

export function trendStats(goal: TrendGoal, now: Date = new Date()): TrendStats {
  const sorted = [...goal.logs].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const firstLogged = sorted[0]?.value;
  const lastLogged = sorted[sorted.length - 1]?.value;
  const first = typeof firstLogged === 'number' ? firstLogged : goal.startValue;
  const last = typeof lastLogged === 'number' ? lastLogged : goal.startValue;
  const totalDelta = goal.targetValue - goal.startValue;
  const progressDelta = last - goal.startValue;
  const pct = totalDelta === 0 ? 0 : clampPercentage((progressDelta / totalDelta) * 100);
  const days = differenceInDays(new Date(goal.startDate), new Date(goal.targetDate));
  const daysIn = differenceInDays(new Date(goal.startDate), now);
  const expected = goal.startValue + totalDelta * Math.min(1, daysIn / (days || 1));
  const onPace = goal.direction === 'down' ? last <= expected : last >= expected;
  const aheadBy = Math.abs(last - expected);

  return { last, first, totalDelta, progressDelta, pct, days, daysIn, expected, onPace, aheadBy };
}

export function accumulationStats(
  goal: AccumulationGoal,
  now: Date = new Date(),
): AccumulationStats {
  const total = goal.logs.reduce((sum, log) => sum + (log.value ?? 0), 0);
  const pct = clampPercentage((total / goal.targetTotal) * 100);
  const remaining = Math.max(0, goal.targetTotal - total);
  const days = differenceInDays(new Date(goal.startDate), new Date(goal.targetDate));
  const daysIn = Math.max(1, differenceInDays(new Date(goal.startDate), now));
  const daysLeft = Math.max(0, differenceInDays(now, new Date(goal.targetDate)));
  const pacePerDay = goal.targetTotal / (days || 1);
  const expected = pacePerDay * daysIn;
  const onPace = total >= expected;

  return { total, pct, remaining, days, daysIn, daysLeft, expected, onPace, pacePerDay };
}

export function milestoneStats(goal: MilestoneGoal): MilestoneStats {
  const done = goal.milestones.filter((milestone) => milestone.done).length;
  const total = goal.milestones.length;
  const pct = total > 0 ? (done / total) * 100 : 0;
  const next = goal.milestones.find((milestone) => !milestone.done);

  return { done, total, pct, next };
}
