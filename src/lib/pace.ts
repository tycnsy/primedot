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

interface RebalanceInputs {
  currentPaceSeconds: number;
  hourDifferenceHours: number;
  remainingHoursUnbuffered: number;
}

export type RebalancePredictionMode = 'hours_to_buffer' | 'buffer_to_hours';

export interface RebalancePredictionFromWorkInput {
  mode: 'hours_to_buffer';
  plannedWorkHours: number;
}

export interface RebalancePredictionFromBufferInput {
  mode: 'buffer_to_hours';
  targetBufferModifier: number;
}

export type RebalancePredictionInput =
  | RebalancePredictionFromWorkInput
  | RebalancePredictionFromBufferInput;

export interface RebalancePredictionFromWorkResult extends RebalanceInputs {
  mode: 'hours_to_buffer';
  currentProjectBufferModifier: number;
  plannedWorkHoursBuffered: number;
  plannedWorkHoursUnbuffered: number;
  remainingHoursAfterPlannedWork: number;
  predictedBufferModifier: number;
}

export interface RebalancePredictionFromBufferResult extends RebalanceInputs {
  mode: 'buffer_to_hours';
  currentProjectBufferModifier: number;
  targetBufferModifier: number;
  requiredWorkHoursUnbuffered: number;
  requiredWorkHours: number;
  requiredWorkHoursClamped: number;
  clampedToZero: boolean;
}

export type RebalancePredictionResult =
  | RebalancePredictionFromWorkResult
  | RebalancePredictionFromBufferResult;

export type RebalancePredictionFailureReason =
  | RebalanceFailureReason
  | 'invalid_planned_work'
  | 'invalid_target_buffer';

export interface RebalancePredictionFailure {
  ok: false;
  reason: RebalancePredictionFailureReason;
  message: string;
}

export interface RebalancePredictionSuccess {
  ok: true;
  result: RebalancePredictionResult;
}

export type RebalancePredictionOutcome = RebalancePredictionSuccess | RebalancePredictionFailure;

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
  const shared = buildRebalanceInputs(tasks, project, offsetSeconds, now);
  if (!shared.ok) return shared;

  const { currentPaceSeconds, hourDifferenceHours, remainingHoursUnbuffered } = shared.result;
  const rawBufferModifier = hourDifferenceHours / remainingHoursUnbuffered;
  const bufferModifier = Math.round(rawBufferModifier * 100) / 100;
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

export function buildRebalancePredictionOutcome(
  tasks: Task[],
  project: Project,
  offsetSeconds: number,
  input: RebalancePredictionInput,
  now: Date = new Date(),
): RebalancePredictionOutcome {
  const shared = buildRebalanceInputs(tasks, project, offsetSeconds, now);
  if (!shared.ok) return shared;

  const { currentPaceSeconds, hourDifferenceHours, remainingHoursUnbuffered } = shared.result;
  const currentProjectBufferModifier = project.buffer_modifier;
  if (!Number.isFinite(currentProjectBufferModifier) || currentProjectBufferModifier <= 0) {
    return {
      ok: false,
      reason: 'invalid_buffer_modifier',
      message: 'Current project buffer modifier must be positive.',
    };
  }

  if (input.mode === 'hours_to_buffer') {
    if (!Number.isFinite(input.plannedWorkHours) || input.plannedWorkHours < 0) {
      return {
        ok: false,
        reason: 'invalid_planned_work',
        message: 'Planned work hours must be zero or greater.',
      };
    }

    const plannedWorkHoursBuffered = input.plannedWorkHours;
    const plannedWorkHoursUnbuffered = plannedWorkHoursBuffered / currentProjectBufferModifier;
    const remainingHoursAfterPlannedWork = remainingHoursUnbuffered - plannedWorkHoursUnbuffered;
    if (!Number.isFinite(remainingHoursAfterPlannedWork) || remainingHoursAfterPlannedWork <= 0) {
      return {
        ok: false,
        reason: 'invalid_remaining_hours',
        message: 'Planned work leaves no remaining unbuffered hours.',
      };
    }

    const rawPredictedBufferModifier = hourDifferenceHours / remainingHoursAfterPlannedWork;
    const predictedBufferModifier = Math.round(rawPredictedBufferModifier * 100) / 100;
    if (!Number.isFinite(predictedBufferModifier) || predictedBufferModifier <= 0) {
      return {
        ok: false,
        reason: 'invalid_buffer_modifier',
        message: 'Computed buffer modifier is not positive. Adjust pace or due date.',
      };
    }

    return {
      ok: true,
      result: {
        mode: 'hours_to_buffer',
        currentPaceSeconds,
        hourDifferenceHours,
        remainingHoursUnbuffered,
        currentProjectBufferModifier,
        plannedWorkHoursBuffered,
        plannedWorkHoursUnbuffered,
        remainingHoursAfterPlannedWork,
        predictedBufferModifier,
      },
    };
  }

  if (!Number.isFinite(input.targetBufferModifier) || input.targetBufferModifier <= 0) {
    return {
      ok: false,
      reason: 'invalid_target_buffer',
      message: 'Target buffer modifier must be greater than zero.',
    };
  }

  const requiredWorkHoursUnbuffered =
    remainingHoursUnbuffered - hourDifferenceHours / input.targetBufferModifier;
  const requiredWorkHours = requiredWorkHoursUnbuffered * currentProjectBufferModifier;
  const requiredWorkHoursClamped = Math.max(0, requiredWorkHours);

  return {
    ok: true,
    result: {
      mode: 'buffer_to_hours',
      currentPaceSeconds,
      hourDifferenceHours,
      remainingHoursUnbuffered,
      currentProjectBufferModifier,
      targetBufferModifier: input.targetBufferModifier,
      requiredWorkHoursUnbuffered,
      requiredWorkHours,
      requiredWorkHoursClamped,
      clampedToZero: requiredWorkHours < 0,
    },
  };
}

function buildRebalanceInputs(
  tasks: Task[],
  project: Project,
  offsetSeconds: number,
  now: Date,
): RebalanceFailure | { ok: true; result: RebalanceInputs } {
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

  return {
    ok: true,
    result: {
      currentPaceSeconds,
      hourDifferenceHours,
      remainingHoursUnbuffered,
    },
  };
}

/**
 * Unbuffered rate that converts a `current_progress` delta into true estimated
 * seconds (no project buffer). Matches DB `realtime_progress_rate` for simple tasks.
 */
export function unbufferedProgressRate(task: Pick<
  Task,
  'type' | 'scaling_modifier' | 'scripting_modifier' | 'unit_length'
>): number {
  switch (task.type) {
    case 'scaling':
      return Number(task.scaling_modifier) || 0;
    case 'scripting':
      return Number(task.scripting_modifier) || 0;
    case 'custom':
      return Number(task.unit_length) || 0;
    case 'manual':
      return 1;
    default:
      return 0;
  }
}

/** 1. True estimated time for a progress delta (seconds, no buffer). */
export function trueEstimatedTimeSeconds(
  progressDelta: number,
  rate: number,
): number {
  return progressDelta * rate;
}

/** 2. Buffer estimated time = true × buffer_modifier. */
export function bufferEstimatedTimeSeconds(
  trueEstimatedSeconds: number,
  bufferModifier: number,
): number {
  return trueEstimatedSeconds * (Number.isFinite(bufferModifier) ? bufferModifier : 1);
}

/** 3. Buffer-only portion of the estimate. */
export function estimatedTimeDifferenceSeconds(
  trueEstimatedSeconds: number,
  bufferEstimatedSeconds: number,
): number {
  return bufferEstimatedSeconds - trueEstimatedSeconds;
}

/**
 * Round half away from zero (matches Postgres `round(numeric)`).
 * JS `Math.round` uses floor(x+0.5), which maps -17.5 → -17.
 */
function roundHalfAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value >= 0 ? Math.round(value) : -Math.round(-value);
}

/**
 * 4. Minutes to subtract from `target_deadline` (positive = earlier / more margin).
 * Progress decreases yield negative minutes (target moves later).
 */
export function paceSplitAllocationMinutes(
  estimatedTimeDifferenceSeconds: number,
  paceSplitPercentage: number,
): number {
  if (!Number.isFinite(paceSplitPercentage) || paceSplitPercentage === 0) return 0;
  if (!Number.isFinite(estimatedTimeDifferenceSeconds)) return 0;
  return roundHalfAwayFromZero(
    (estimatedTimeDifferenceSeconds * (paceSplitPercentage / 100)) / 60,
  );
}

/** Full pipeline: progress delta → minutes to subtract from target_deadline. */
export function computePaceSplitAllocationMinutes(input: {
  progressDelta: number;
  rate: number;
  bufferModifier: number;
  paceSplitPercentage: number;
}): number {
  const trueEst = trueEstimatedTimeSeconds(input.progressDelta, input.rate);
  const bufferEst = bufferEstimatedTimeSeconds(trueEst, input.bufferModifier);
  const diff = estimatedTimeDifferenceSeconds(trueEst, bufferEst);
  return paceSplitAllocationMinutes(diff, input.paceSplitPercentage);
}
