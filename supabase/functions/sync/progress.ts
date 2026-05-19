// Mirror of `deriveStatusFromDraft` in src/hooks/useTasks.ts.
// Keep these two implementations in lockstep so the web app and the sync
// Edge Function always agree on the derived status for a given progress
// value.

export type TaskStatus = 'not_started' | 'in_progress' | 'complete';
export type TaskType = 'scaling' | 'scripting' | 'custom' | 'manual';

export interface TaskStatusDraft {
  type: TaskType;
  current_progress: number;
  scaling_modifier: number | null;
  scripting_modifier: number | null;
  script_length: number | null;
  unit_count: number | null;
  unit_length: number | null;
  manual_length: number | null;
}

export function deriveStatusFromDraft(
  draft: TaskStatusDraft,
  projectVideoLength: number,
): TaskStatus {
  const current = Number.isFinite(draft.current_progress)
    ? draft.current_progress
    : 0;
  if (current <= 0) return 'not_started';

  let target = 0;
  switch (draft.type) {
    case 'scaling':
      target = Number.isFinite(projectVideoLength) ? projectVideoLength : 0;
      break;
    case 'scripting':
      target =
        typeof draft.script_length === 'number' &&
        Number.isFinite(draft.script_length)
          ? draft.script_length
          : 0;
      break;
    case 'manual':
      target =
        typeof draft.manual_length === 'number' &&
        Number.isFinite(draft.manual_length)
          ? draft.manual_length
          : 0;
      break;
    case 'custom':
      target =
        typeof draft.unit_count === 'number' &&
        Number.isFinite(draft.unit_count)
          ? draft.unit_count
          : 0;
      break;
  }

  if (target > 0 && current >= target) return 'complete';
  return 'in_progress';
}
