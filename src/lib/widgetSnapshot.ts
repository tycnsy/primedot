import { currentPace, currentPaceEnd, paceMargin } from './calc';
import type { PaceSettings, Project, Task } from './types';

export const PACE_WIDGET_MAX_ITEMS = 8;

export type PaceWidgetTone = 'behind' | 'tight' | 'ahead';

export interface PaceWidgetItem {
  projectId: string;
  projectName: string;
  paceSeconds: number;
  marginSeconds: number;
  paceEndISO: string;
  tone: PaceWidgetTone;
}

export interface PaceWidgetSnapshotV1 {
  version: 1;
  generatedAtISO: string;
  itemCount: number;
  items: PaceWidgetItem[];
}

function toTone(seconds: number): PaceWidgetTone {
  if (seconds < 0) return 'behind';
  if (seconds < 3600) return 'tight';
  return 'ahead';
}

function clampWidgetItems(items: PaceWidgetItem[]): PaceWidgetItem[] {
  return items.slice(0, PACE_WIDGET_MAX_ITEMS);
}

export function buildPaceWidgetSnapshot(args: {
  projects: Project[];
  tasks: Task[];
  paceByProject: Record<string, PaceSettings>;
  now?: Date;
}): PaceWidgetSnapshotV1 {
  const now = args.now ?? new Date();
  const tasksByProject = args.tasks.reduce<Record<string, Task[]>>((acc, task) => {
    if (!acc[task.project_id]) acc[task.project_id] = [];
    acc[task.project_id].push(task);
    return acc;
  }, {});

  const orderedItems = args.projects
    .map((project) => {
      const pace = args.paceByProject[project.id];
      if (!pace) return null;

      const projectTasks = tasksByProject[project.id] ?? [];
      const paceSeconds = currentPace(projectTasks, project, pace, now);
      const marginSeconds = paceMargin(pace);
      const paceEnd = currentPaceEnd(projectTasks, project, pace);

      return {
        projectId: project.id,
        projectName: project.name,
        paceSeconds,
        marginSeconds,
        paceEndISO: paceEnd.toISOString(),
        tone: toTone(paceSeconds),
      } satisfies PaceWidgetItem;
    })
    .filter((item): item is PaceWidgetItem => !!item);

  const items = clampWidgetItems(orderedItems);
  return {
    version: 1,
    generatedAtISO: now.toISOString(),
    itemCount: items.length,
    items,
  };
}
