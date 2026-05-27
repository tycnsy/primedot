import { addDays, format, startOfWeek } from 'date-fns';
import type { Project } from './types';

export type ProjectGroupBy = 'none' | 'week' | 'month' | 'tag' | 'series';
export type ProjectSortBy = 'due_date' | 'series';

export interface ProjectGroup {
  key: string;
  label: string;
  projects: Project[];
}

function dueTime(project: Project): number | null {
  if (!project.due_date) return null;
  const value = new Date(project.due_date).getTime();
  return Number.isNaN(value) ? null : value;
}

function compareDueDate(a: Project, b: Project): number {
  const aDue = dueTime(a);
  const bDue = dueTime(b);
  if (aDue == null && bDue == null) return b.created_at.localeCompare(a.created_at);
  if (aDue == null) return 1;
  if (bDue == null) return -1;
  if (aDue !== bDue) return aDue - bDue;
  return b.created_at.localeCompare(a.created_at);
}

function compareSeries(a: Project, b: Project): number {
  const aSeries = a.series?.trim().toLowerCase() ?? '';
  const bSeries = b.series?.trim().toLowerCase() ?? '';
  if (aSeries !== bSeries) return aSeries.localeCompare(bSeries);
  return compareDueDate(a, b);
}

export function sortProjects(projects: Project[], sortBy: ProjectSortBy): Project[] {
  const next = [...projects];
  next.sort(sortBy === 'series' ? compareSeries : compareDueDate);
  return next;
}

function weekKey(project: Project): string {
  if (!project.due_date) return 'none';
  const due = new Date(project.due_date);
  if (Number.isNaN(due.getTime())) return 'none';
  const start = startOfWeek(due, { weekStartsOn: 0 });
  return format(start, 'yyyy-MM-dd');
}

function weekLabel(key: string): string {
  if (key === 'none') return 'No due date';
  const start = new Date(`${key}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 'No due date';
  const end = addDays(start, 6);
  return `${format(start, 'EEE MMM d')} - ${format(end, 'EEE MMM d')}`;
}

function monthKey(project: Project): string {
  if (!project.due_date) return 'none';
  const due = new Date(project.due_date);
  if (Number.isNaN(due.getTime())) return 'none';
  return format(due, 'yyyy-MM');
}

function monthLabel(key: string): string {
  if (key === 'none') return 'No due date';
  const parsed = new Date(`${key}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'No due date';
  return format(parsed, 'MMMM yyyy');
}

function groupName(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function groupComparator(a: ProjectGroup, b: ProjectGroup, groupBy: ProjectGroupBy): number {
  if (a.key === 'none' && b.key !== 'none') return 1;
  if (b.key === 'none' && a.key !== 'none') return -1;
  if (groupBy === 'week' || groupBy === 'month') return a.key.localeCompare(b.key);
  return a.label.localeCompare(b.label);
}

export function buildProjectGroups(
  projects: Project[],
  groupBy: ProjectGroupBy,
  sortBy: ProjectSortBy,
): ProjectGroup[] {
  if (groupBy === 'none') {
    return [{ key: 'all', label: 'All projects', projects: sortProjects(projects, sortBy) }];
  }

  const groups = new Map<string, Project[]>();
  projects.forEach((project) => {
    let key = '';
    if (groupBy === 'week') key = weekKey(project);
    if (groupBy === 'month') key = monthKey(project);
    if (groupBy === 'tag') key = groupName(project.tag, 'Untagged');
    if (groupBy === 'series') key = groupName(project.series, 'No series');
    const list = groups.get(key) ?? [];
    list.push(project);
    groups.set(key, list);
  });

  const result: ProjectGroup[] = [];
  groups.forEach((groupProjects, key) => {
    const label =
      groupBy === 'week'
        ? weekLabel(key)
        : groupBy === 'month'
          ? monthLabel(key)
          : key;
    result.push({
      key,
      label,
      projects: sortProjects(groupProjects, sortBy),
    });
  });

  result.sort((a, b) => groupComparator(a, b, groupBy));
  return result;
}
