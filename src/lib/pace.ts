import { estimatedCompletion } from './calc';
import type { PaceSettings, Project, Task } from './types';

const WEEK_IN_MS = 7 * 86_400_000;

export type PacePatch = Partial<Pick<PaceSettings, 'target_deadline' | 'true_deadline'>>;

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
