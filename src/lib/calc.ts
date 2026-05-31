import type { ComplexMode, PaceSettings, Project, Task, TaskStatus } from './types';

const safeNum = (v: number | null | undefined, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const normalizePaceModifier = (value: number | undefined): number =>
  Math.max(0, safeNum(value, 1));
type TaskProgressSource = Pick<
  Task,
  | 'type'
  | 'current_progress'
  | 'scaling_modifier'
  | 'scripting_modifier'
  | 'script_length'
  | 'unit_count'
  | 'unit_length'
  | 'manual_length'
> & {
  id?: string;
  parent_id?: string | null;
  complex_mode?: ComplexMode | null;
};

// ---------- Complex task helpers ----------

/** Subtasks of a complex parent, ordered by sort_order. */
export function getSubtasks(parentId: string, allTasks: Task[]): Task[] {
  return allTasks
    .filter((t) => t.parent_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Rolled-up scaling_modifier for a complex parent — sum of subtask modifiers.
 * Falls back to the parent's own stored modifier if there are no subtasks
 * (used as a defensive default during edge cases).
 */
export function complexParentEffectiveModifier(parent: Task, allTasks: Task[]): number {
  const subs = getSubtasks(parent.id, allTasks);
  if (subs.length === 0) return safeNum(parent.scaling_modifier);
  return subs.reduce((acc, s) => acc + safeNum(s.scaling_modifier), 0);
}

/**
 * True if any two subtasks have different `current_progress` values.
 * Used to decide whether the collapse conflict modal needs to open.
 */
export function subtasksHaveProgressMismatch(parent: Task, allTasks: Task[]): boolean {
  const subs = getSubtasks(parent.id, allTasks);
  if (subs.length < 2) return false;
  const first = subs[0].current_progress;
  return subs.some((s) => s.current_progress !== first);
}

/**
 * The `current_progress` value to display on a compressed parent row.
 * Returns the common subtask value when all subtasks agree;
 * otherwise falls back to the parent's stored value.
 */
export function complexParentEffectiveProgress(parent: Task, allTasks: Task[]): number {
  const subs = getSubtasks(parent.id, allTasks);
  if (subs.length === 0) return safeNum(parent.current_progress);
  if (subtasksHaveProgressMismatch(parent, allTasks)) return safeNum(parent.current_progress);
  return subs[0].current_progress;
}

/** True when this task is a complex parent (has a complex_mode set). */
export function isComplexParent(task: TaskProgressSource): boolean {
  return task.complex_mode === 'compressed' || task.complex_mode === 'expanded';
}

/** True when this task is a subtask (has a parent_id set). */
export function isSubtask(task: TaskProgressSource): boolean {
  return !!task.parent_id;
}

/**
 * `task_length` (seconds) — total real time the task is expected to take, buffered.
 *
 * scaling:    project.video_length * scaling_modifier * buffer_modifier
 * scripting:  script_length         * scripting_modifier * buffer_modifier
 * custom:     unit_count * unit_length * buffer_modifier
 * manual:     manual_length * buffer_modifier
 *
 * Complex-task overrides (when `allTasks` is supplied):
 *   - expanded parent → 0 (parent itself contributes nothing; subtasks count individually)
 *   - compressed parent → uses the rolled-up modifier (sum of subtask modifiers)
 */
export function taskLength(
  task: TaskProgressSource,
  project: Project,
  allTasks?: Task[],
): number {
  const buffer = safeNum(project.buffer_modifier, 1);

  if (task.complex_mode === 'expanded') return 0;
  if (task.complex_mode === 'compressed' && task.id && allTasks) {
    const modifier = complexParentEffectiveModifier(task as Task, allTasks);
    return safeNum(project.video_length) * modifier * buffer;
  }

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
 * For complete tasks (derived from progress), treat progress as fully-done
 * regardless of the stored value.
 *
 * Complex-task overrides (when `allTasks` is supplied):
 *   - expanded parent → 0 (subtasks contribute individually)
 *   - compressed parent → uses rolled-up modifier and effective subtask progress
 */
export function calculatedProgress(
  task: TaskProgressSource,
  project: Project,
  allTasks?: Task[],
): number {
  if (task.complex_mode === 'expanded') return 0;
  if (task.complex_mode === 'compressed' && task.id && allTasks) {
    if (deriveTaskStatus(task, project, allTasks) === 'complete') {
      return taskLength(task, project, allTasks);
    }
    const buffer = safeNum(project.buffer_modifier, 1);
    const modifier = complexParentEffectiveModifier(task as Task, allTasks);
    const cp = complexParentEffectiveProgress(task as Task, allTasks);
    return cp * modifier * buffer;
  }

  if (deriveTaskStatus(task, project, allTasks) === 'complete') {
    return taskLength(task, project, allTasks);
  }
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
export function progressTarget(task: TaskProgressSource, project: Project): number {
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

/**
 * Progress percentage derived from current_progress vs task target.
 * Can exceed 100 when progress is beyond target.
 *
 * For compressed complex parents (with `allTasks` supplied), uses the rolled-up
 * progress (subtask common value when synced, else parent's stored value).
 */
export function taskProgressPercent(
  task: TaskProgressSource,
  project: Project,
  allTasks?: Task[],
): number {
  const target = progressTarget(task, project);
  let current: number;
  if (task.complex_mode === 'compressed' && task.id && allTasks) {
    current = complexParentEffectiveProgress(task as Task, allTasks);
  } else {
    current = safeNum(task.current_progress);
  }
  if (target <= 0) return current <= 0 ? 0 : 100;
  return (current / target) * 100;
}

/**
 * Automatic status derived from progress thresholds.
 * <= 0% => not_started, >= 100% => complete, otherwise in_progress.
 */
export function deriveTaskStatus(
  task: TaskProgressSource,
  project: Project,
  allTasks?: Task[],
): TaskStatus {
  const percent = taskProgressPercent(task, project, allTasks);
  if (percent <= 0) return 'not_started';
  if (percent >= 100) return 'complete';
  return 'in_progress';
}

/**
 * Determine whether a task should be counted in project-level aggregations.
 * Skip expanded parents (counted via subtasks) and subtasks under compressed
 * parents (counted via the parent rollup).
 */
function shouldCountInAggregate(task: Task, allTasks: Task[]): boolean {
  if (task.complex_mode === 'expanded') return false;
  if (task.parent_id) {
    const parent = allTasks.find((t) => t.id === task.parent_id);
    if (parent && parent.complex_mode === 'compressed') return false;
  }
  return true;
}

export function totalTaskLength(tasks: Task[], project: Project): number {
  return tasks.reduce((acc, t) => {
    if (!shouldCountInAggregate(t, tasks)) return acc;
    return acc + taskLength(t, project, tasks);
  }, 0);
}

export function bufferModifierGoal(tasks: Task[], project: Project): number | null {
  if (!project.due_date) return null;
  const startMs = new Date(project.start_date ?? project.created_at).getTime();
  const dueMs = new Date(project.due_date).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(dueMs)) return null;

  const windowHours = (dueMs - startMs) / 3_600_000;
  if (!Number.isFinite(windowHours) || windowHours <= 0) return null;

  const totalUnbufferedHours = totalTaskLength(tasks, {
    ...project,
    buffer_modifier: 1,
  }) / 3_600;
  if (!Number.isFinite(totalUnbufferedHours) || totalUnbufferedHours <= 0) return null;

  const goal = windowHours / totalUnbufferedHours;
  return Number.isFinite(goal) && goal > 0 ? goal : null;
}

export function projectProgress(tasks: Task[], project: Project): number {
  return tasks.reduce((acc, t) => {
    if (!shouldCountInAggregate(t, tasks)) return acc;
    return acc + calculatedProgress(t, project, tasks);
  }, 0);
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
  task: TaskProgressSource,
  project: Project,
  timerDurationSeconds: number,
  paceModifier = 1,
  allTasks?: Task[],
): number {
  const buffer = safeNum(project.buffer_modifier, 1);
  const t = Math.max(0, timerDurationSeconds);
  const modifier = normalizePaceModifier(paceModifier);

  if (task.complex_mode === 'compressed' && task.id && allTasks) {
    const m = complexParentEffectiveModifier(task as Task, allTasks);
    const denom = m * buffer;
    return (denom > 0 ? t / denom : 0) * modifier;
  }

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
  task: TaskProgressSource,
  project: Project,
  startCurrentProgress: number,
  timerDurationSeconds: number,
  paceModifier = 1,
  allTasks?: Task[],
): number {
  const delta = progressDelta(task, project, timerDurationSeconds, paceModifier, allTasks);
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
