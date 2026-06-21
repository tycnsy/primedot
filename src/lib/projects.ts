import {
  childrenOf,
  isChildItem,
  isParentItem,
  parentIdsWithChildren,
  parentItems,
  type ParentChildItem,
} from './parentChild';
import type { Project } from './types';

export {
  childrenOf,
  isChildItem,
  isParentItem,
  parentIdsWithChildren,
  parentItems,
};

export function isSubproject(project: Project): boolean {
  return isChildItem(project);
}

export function isParentProject(project: Project): boolean {
  return isParentItem(project);
}

export function parentProjects(projects: Project[]): Project[] {
  return parentItems(projects);
}

export function subprojectsOf(projects: Project[], parentId: string): Project[] {
  return childrenOf(projects, parentId);
}

export function paceEligibleProjects(projects: Project[]): Project[] {
  const parentsWithChildren = parentIdsWithChildren(projects);
  return projects.filter(
    (project) =>
      isChildItem(project) ||
      (isParentItem(project) && !parentsWithChildren.has(project.id)),
  );
}

export function projectTreeLabel(
  project: Pick<Project, 'name' | 'parent_id'>,
  parentNameById: Map<string, string>,
): string {
  if (!project.parent_id) return project.name;
  const parentName = parentNameById.get(project.parent_id);
  return parentName ? `${project.name} (${parentName})` : project.name;
}

export function resolvedProjectTagSeries(
  project: Pick<Project, 'tag' | 'series' | 'parent_id'>,
  parent?: Pick<Project, 'tag' | 'series'> | null,
): { tag: string | null; series: string | null } {
  if (!project.parent_id || !parent) {
    return { tag: project.tag, series: project.series };
  }
  return { tag: parent.tag, series: parent.series };
}

export type { ParentChildItem };
