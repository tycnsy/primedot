import type { PaceSettings, Project, Task } from './types';

const safeNum = (v: number | null | undefined, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const normalizePaceModifier = (value: number | undefined): number =>
  Math.max(0, safeNum(value, 1));

/**
 * `task_length` (seconds) — total real time the task is expected to take, buffered.
 *
 * scaling:    project.video_length * scaling_modifier * buffer_modifier
 * scripting:  script_length         * scripting_modifier * buffer_modifier
 * custom:     unit_count * unit_length * buffer_modifier
 * manual:     manual_length * buffer_modifier
 */
export function taskLength(task: Task, project: Project): number {
  const buffer = safeNum(project.buffer_modifier, 1);
  switch (task.type) {
    case 'scaling':
      return (
        safeNum(project.video_length) *
        safeNum(task.scaling_modifier) *
        buffer
      );
    case 'scripting':
      return (
        safeNum(task.script_length) *
        safeNum(task.scripting_modifier) *
        buffer
      );
    case 'custom':
      return safeNum(task.unit_count) * safeNum(task.unit_length) * buffer;
    case 'manual':
      return safeNum(task.manual_length) * buffer;
    default:
      return 0;
  }
}

/**
 * `calculated_progress` (seconds) — converts the user's stored `current_progress`
 * input into real-time seconds, applying buffer.
 *
 * For `complete` tasks we treat progress as fully-done regardless of the stored
 * value, per the SPEC open-question resolution.
 */
export function calculatedProgress(task: Task, project: Project): number {
  if (task.status === 'complete') return taskLength(task, project);
  const buffer = safeNum(project.buffer_modifier, 1);
  const cp = safeNum(task.current_progress);
  switch (task.type) {
    case 'scaling':
      return cp * safeNum(task.scaling_modifier) * buffer;
    case 'scripting':
      return cp * safeNum(task.scripting_modifier) * buffer;
    case 'custom':
      return cp * safeNum(task.unit_length) * buffer;
    case 'manual':
      return cp * buffer;
    default:
      return 0;
  }
}

/**
 * Progress denominator shown in UI (same unit as `current_progress`).
 *
 * scaling:   project.video_length
 * scripting: task.script_length
 * manual:    task.manual_length
 * custom:    task.unit_count
 */
export function progressTarget(task: Task, project: Project): number {
  switch (task.type) {
    case 'scaling':
      return safeNum(project.video_length);
    case 'scripting':
      return safeNum(task.script_length);
    case 'manual':
      return safeNum(task.manual_length);
    case 'custom':
      return safeNum(task.unit_count);
    default:
      return 0;
  }
}

export function totalTaskLength(tasks: Task[], project: Project): number {
  return tasks.reduce((acc, t) => acc + taskLength(t, project), 0);
}

export function projectProgress(tasks: Task[], project: Project): number {
  return tasks.reduce((acc, t) => acc + calculatedProgress(t, project), 0);
}

export function remainingProgress(tasks: Task[], project: Project): number {
  return Math.max(
    0,
    totalTaskLength(tasks, project) - projectProgress(tasks, project),
  );
}

/**
 * SPEC §"Estimated Progress Goal" — convert a real-time chunk (the timer
 * duration) into the unit `current_progress` is stored in for this task.
 *
 *   scaling:   timer / (scaling_modifier   * buffer)
 *   scripting: timer / (scripting_modifier * buffer)
 *   manual:    timer / buffer
 *   custom:    floor(timer / (unit_length * buffer))   // whole units only
 */
export function progressDelta(
  task: Task,
  project: Project,
  timerDurationSeconds: number,
  paceModifier = 1,
): number {
  const buffer = safeNum(project.buffer_modifier, 1);
  const t = Math.max(0, timerDurationSeconds);
  const modifier = normalizePaceModifier(paceModifier);
  switch (task.type) {
    case 'scaling': {
      const denom = safeNum(task.scaling_modifier) * buffer;
      return (denom > 0 ? t / denom : 0) * modifier;
    }
    case 'scripting': {
      const denom = safeNum(task.scripting_modifier) * buffer;
      return (denom > 0 ? t / denom : 0) * modifier;
    }
    case 'manual':
      return (buffer > 0 ? t / buffer : 0) * modifier;
    case 'custom': {
      const denom = safeNum(task.unit_length) * buffer;
      return (denom > 0 ? Math.floor(t / denom) : 0) * modifier;
    }
    default:
      return 0;
  }
}

/**
 * `goal_progress` = `current_progress` at timer start + `progress_delta`.
 * For custom tasks this is a whole-integer count of units.
 */
export function goalProgress(
  task: Task,
  project: Project,
  startCurrentProgress: number,
  timerDurationSeconds: number,
  paceModifier = 1,
): number {
  const delta = progressDelta(task, project, timerDurationSeconds, paceModifier);
  if (task.type === 'custom') {
    return Math.floor(startCurrentProgress) + Math.floor(delta);
  }
  return startCurrentProgress + delta;
}

// ---------- Pace ----------

/** `now() + remaining_progress` */
export function estimatedCompletion(
  tasks: Task[],
  project: Project,
  now: Date = new Date(),
): Date {
  const seconds = remainingProgress(tasks, project);
  return new Date(now.getTime() + seconds * 1000);
}

/** `target_deadline - estimated_completion` (seconds, signed) */
export function currentPace(
  tasks: Task[],
  project: Project,
  pace: PaceSettings,
  now: Date = new Date(),
): number {
  const target = new Date(pace.target_deadline).getTime();
  const completion = estimatedCompletion(tasks, project, now).getTime();
  return Math.round((target - completion) / 1000);
}

/** `true_deadline - target_deadline` (seconds, signed) */
export function paceMargin(pace: PaceSettings): number {
  return Math.round(
    (new Date(pace.true_deadline).getTime() -
      new Date(pace.target_deadline).getTime()) /
      1000,
  );
}

/**
 * `current_pace_end` = `target_deadline - remaining_progress`.
 * Stable over time (only changes when remaining_progress or target_deadline change).
 */
export function currentPaceEnd(
  tasks: Task[],
  project: Project,
  pace: PaceSettings,
): Date {
  const target = new Date(pace.target_deadline).getTime();
  return new Date(target - remainingProgress(tasks, project) * 1000);
}
