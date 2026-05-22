import { estimatedCompletion } from './calc';
import type { PaceSettings, Project, Task } from './types';

const WEEK_IN_MS = 7 * 86_400_000;

export type PacePatch = Partial<Pick<PaceSettings, 'target_deadline' | 'true_deadline'>>;
export interface RebalanceResult {
  estimatedCompletion: Date;
  targetDeadline: Date;
  targetDeadlineIso: string;
  currentPaceSeconds: number;
  hourDifferenceHours: number;
  remainingHoursUnbuffered: number;
  bufferModifier: number;
}

export type RebalanceFailureReason =
  | 'missing_due_date'
  | 'invalid_due_date'
  | 'invalid_offset'
  | 'invalid_remaining_hours'
  | 'invalid_buffer_modifier';

export interface RebalanceFailure {
  ok: false;
  reason: RebalanceFailureReason;
  message: string;
}

export interface RebalanceSuccess {
  ok: true;
  result: RebalanceResult;
}

export type RebalanceOutcome = RebalanceSuccess | RebalanceFailure;

export function buildPacePatchFromBufferSeconds(
  tasks: Task[],
  project: Project,
  bufferSeconds: number,
  trueDeadline?: string,
): { target: Date; patch: PacePatch } {
  const completion = estimatedCompletion(tasks, project);
  const target = new Date(completion.getTime() + bufferSeconds * 1000);
  return {
    target,
    patch: {
      target_deadline: target.toISOString(),
      true_deadline:
        trueDeadline ?? new Date(target.getTime() + WEEK_IN_MS).toISOString(),
    },
  };
}

export function buildRebalanceOutcome(
  tasks: Task[],
  project: Project,
  offsetSeconds: number,
  now: Date = new Date(),
): RebalanceOutcome {
  if (!project.due_date) {
    return {
      ok: false,
      reason: 'missing_due_date',
      message: 'Set a due date on this project before rebalancing.',
    };
  }

  if (!Number.isFinite(offsetSeconds)) {
    return {
      ok: false,
      reason: 'invalid_offset',
      message: 'Pace offset must be a valid number.',
    };
  }

  const dueDateMs = new Date(project.due_date).getTime();
  if (Number.isNaN(dueDateMs)) {
    return {
      ok: false,
      reason: 'invalid_due_date',
      message: 'Project due date is invalid. Update it and try again.',
    };
  }

  const currentPaceSeconds = Math.round(offsetSeconds);
  const hourDifferenceHours = (dueDateMs - (now.getTime() + currentPaceSeconds * 1000)) / 3_600_000;

  const unbufferedProject: Project = { ...project, buffer_modifier: 1 };
  const remainingHoursUnbuffered =
    (estimatedCompletion(tasks, unbufferedProject, now).getTime() - now.getTime()) /
    3_600_000;

  if (!Number.isFinite(remainingHoursUnbuffered) || remainingHoursUnbuffered <= 0) {
    return {
      ok: false,
      reason: 'invalid_remaining_hours',
      message: 'No remaining unbuffered hours left to rebalance.',
    };
  }

  const rawBufferModifier = hourDifferenceHours / remainingHoursUnbuffered;
  const bufferModifier = Math.round(rawBufferModifier * 10) / 10;
  if (!Number.isFinite(bufferModifier) || bufferModifier <= 0) {
    return {
      ok: false,
      reason: 'invalid_buffer_modifier',
      message: 'Computed buffer modifier is not positive. Adjust pace or due date.',
    };
  }

  const rebalancedProject: Project = { ...project, buffer_modifier: bufferModifier };
  const estimatedCompletionAtRebalancedBuffer = estimatedCompletion(tasks, rebalancedProject, now);
  const targetDeadline = new Date(
    estimatedCompletionAtRebalancedBuffer.getTime() + currentPaceSeconds * 1000,
  );

  return {
    ok: true,
    result: {
      estimatedCompletion: estimatedCompletionAtRebalancedBuffer,
      targetDeadline,
      targetDeadlineIso: targetDeadline.toISOString(),
      currentPaceSeconds,
      hourDifferenceHours,
      remainingHoursUnbuffered,
      bufferModifier,
    },
  };
}
