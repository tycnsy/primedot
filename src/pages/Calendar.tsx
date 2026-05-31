import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  dueDateForDropTarget,
  localDayKeyFromDate,
  localDayKeyFromIso,
  startDateForDropDay,
} from '../lib/calendarDueDate';
import { bufferModifierGoal } from '../lib/calc';
import TagPill from '../components/TagPill';
import {
  useAllProjectsIncludingArchived,
  useProjectTags,
  useUpdateProject,
} from '../hooks/useProjects';
import { useTasksForProjects } from '../hooks/useTasks';
import type { Project } from '../lib/types';

type CalendarCell = {
  dayKey: string;
  date: Date;
  labelDay: number;
};

type CalendarWeek = {
  key: string;
  monthDate: Date;
  cells: CalendarCell[];
};

type CalendarView = 'due' | 'start';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, diff: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + diff, 1);
}

function compareMonths(a: Date, b: Date): number {
  if (a.getFullYear() !== b.getFullYear()) {
    return a.getFullYear() - b.getFullYear();
  }
  return a.getMonth() - b.getMonth();
}

function latestDueDateMonth(projects: Project[]): Date | null {
  let latest: Date | null = null;
  for (const project of projects) {
    if (!project.due_date) continue;
    const date = new Date(project.due_date);
    if (Number.isNaN(date.getTime())) continue;
    if (!latest || date > latest) {
      latest = date;
    }
  }
  return latest ? startOfMonth(latest) : null;
}

function monthTitle(date: Date): string {
  return date.toLocaleString([], { month: 'long', year: 'numeric' });
}

function buildCalendarWeeks(startMonth: Date, endMonth: Date): CalendarWeek[] {
  const firstOfStart = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1);
  const lastOfEnd = new Date(endMonth.getFullYear(), endMonth.getMonth() + 1, 0);
  const gridStart = new Date(
    firstOfStart.getFullYear(),
    firstOfStart.getMonth(),
    1 - firstOfStart.getDay(),
  );
  const gridEnd = new Date(
    lastOfEnd.getFullYear(),
    lastOfEnd.getMonth(),
    lastOfEnd.getDate() + (6 - lastOfEnd.getDay()),
  );
  const cells: CalendarCell[] = [];
  for (
    const cursor = new Date(gridStart);
    cursor <= gridEnd;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const cellDate = new Date(cursor);
    cells.push({
      dayKey: localDayKeyFromDate(cellDate),
      date: cellDate,
      labelDay: cellDate.getDate(),
    });
  }

  const weeks: CalendarWeek[] = [];
  for (let index = 0; index < cells.length; index += 7) {
    const weekCells = cells.slice(index, index + 7);
    if (weekCells.length < 7) continue;
    const firstDay = weekCells[0];
    weeks.push({
      key: firstDay.dayKey,
      monthDate: startOfMonth(firstDay.date),
      cells: weekCells,
    });
  }
  return weeks;
}

function buildProjectsByDay(
  projects: Project[],
  getIso: (project: Project) => string | null | undefined,
): Map<string, Project[]> {
  const byDay = new Map<string, Project[]>();
  for (const project of projects) {
    const dayKey = localDayKeyFromIso(getIso(project));
    if (!dayKey) continue;
    const list = byDay.get(dayKey);
    if (list) {
      list.push(project);
    } else {
      byDay.set(dayKey, [project]);
    }
  }
  return byDay;
}

function formatEndDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDurationUntilEnd(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): string | null {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) return null;
  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days}d ${hours}h until end`;
}

export default function Calendar() {
  const { data: projects = [], isLoading, error } = useAllProjectsIncludingArchived();
  const { data: projectTags = [] } = useProjectTags();
  const { data: tasks = [] } = useTasksForProjects(projects.map((project) => project.id));
  const updateProject = useUpdateProject();
  const [view, setView] = useState<CalendarView>('due');
  const [loadedStartMonth, setLoadedStartMonth] = useState<Date>(() => {
    const now = new Date();
    return addMonths(startOfMonth(now), -1);
  });
  const [loadedEndMonth, setLoadedEndMonth] = useState<Date>(() => {
    const now = new Date();
    return addMonths(startOfMonth(now), 1);
  });
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const todayCellRef = useRef<HTMLDivElement | null>(null);
  const weekRowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const didScrollToTodayRef = useRef(false);
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => loadedStartMonth);

  const undatedProjects = useMemo(
    () => projects.filter((project) => localDayKeyFromIso(project.due_date) == null),
    [projects],
  );
  const projectsByDay = useMemo(
    () =>
      buildProjectsByDay(projects, (project) =>
        view === 'start' ? project.start_date : project.due_date,
      ),
    [projects, view],
  );
  const todayKey = useMemo(() => localDayKeyFromDate(new Date()), []);
  const tagColorByName = useMemo(
    () => new Map(projectTags.map((tag) => [tag.name, tag.color] as const)),
    [projectTags],
  );
  const tasksByProjectId = useMemo(() => {
    const byProject = new Map<string, typeof tasks>();
    for (const task of tasks) {
      const existing = byProject.get(task.project_id);
      if (existing) {
        existing.push(task);
      } else {
        byProject.set(task.project_id, [task]);
      }
    }
    return byProject;
  }, [tasks]);
  const bufferGoalByProjectId = useMemo(() => {
    const byProject = new Map<string, number | null>();
    for (const project of projects) {
      const projectTasks = tasksByProjectId.get(project.id) ?? [];
      byProject.set(project.id, bufferModifierGoal(projectTasks, project));
    }
    return byProject;
  }, [projects, tasksByProjectId]);
  const maxDueMonth = useMemo(() => latestDueDateMonth(projects), [projects]);
  const minFutureEnd = useMemo(() => addMonths(startOfMonth(new Date()), 1), []);
  const preferredFutureEnd = useMemo(() => {
    const candidate = maxDueMonth ? addMonths(maxDueMonth, 1) : minFutureEnd;
    return compareMonths(candidate, minFutureEnd) > 0 ? candidate : minFutureEnd;
  }, [maxDueMonth, minFutureEnd]);
  const calendarWeeks = useMemo(() => {
    return buildCalendarWeeks(loadedStartMonth, loadedEndMonth);
  }, [loadedStartMonth, loadedEndMonth]);

  useEffect(() => {
    setLoadedEndMonth((prev) =>
      compareMonths(preferredFutureEnd, prev) > 0 ? preferredFutureEnd : prev,
    );
  }, [preferredFutureEnd]);

  useEffect(() => {
    if (!calendarWeeks.length) return;
    weekRowRefs.current = weekRowRefs.current.slice(0, calendarWeeks.length);
  }, [calendarWeeks]);

  useEffect(() => {
    const container = timelineRef.current;
    if (!container || calendarWeeks.length === 0) return;

    const updateVisibleMonth = () => {
      const containerTop = container.getBoundingClientRect().top;
      const stickyOffset = 64;
      const threshold = containerTop + stickyOffset;
      let nextVisibleMonth = calendarWeeks[0].monthDate;
      for (let index = 0; index < calendarWeeks.length; index += 1) {
        const row = weekRowRefs.current[index];
        if (!row) continue;
        const rect = row.getBoundingClientRect();
        if (rect.bottom >= threshold) {
          nextVisibleMonth = calendarWeeks[index].monthDate;
          break;
        }
      }
      setVisibleMonth((prev) =>
        compareMonths(prev, nextVisibleMonth) === 0 ? prev : nextVisibleMonth,
      );
    };

    updateVisibleMonth();
    container.addEventListener('scroll', updateVisibleMonth, { passive: true });
    window.addEventListener('resize', updateVisibleMonth);
    return () => {
      container.removeEventListener('scroll', updateVisibleMonth);
      window.removeEventListener('resize', updateVisibleMonth);
    };
  }, [calendarWeeks]);

  useEffect(() => {
    if (didScrollToTodayRef.current) return;
    const container = timelineRef.current;
    const todayCell = todayCellRef.current;
    if (!container || !todayCell) return;
    const offsetWithinContainer = todayCell.offsetTop - container.offsetTop;
    container.scrollTop = Math.max(offsetWithinContainer - 60, 0);
    didScrollToTodayRef.current = true;
  }, [calendarWeeks]);

  const dropProject = async (target: { type: 'undated' } | { type: 'day'; dayKey: string }) => {
    if (!draggingProjectId) return;
    const project = projects.find((item) => item.id === draggingProjectId);
    if (!project) {
      setDraggingProjectId(null);
      return;
    }

    if (view === 'start') {
      if (target.type !== 'day') {
        setDraggingProjectId(null);
        return;
      }
      const currentDayKey = localDayKeyFromIso(project.start_date);
      if (currentDayKey === target.dayKey) {
        setDraggingProjectId(null);
        return;
      }

      setMutationError(null);
      try {
        await updateProject.mutateAsync({
          id: project.id,
          patch: { start_date: startDateForDropDay(target.dayKey) },
        });
      } catch (err) {
        setMutationError(err instanceof Error ? err.message : 'Failed to update start date.');
      } finally {
        setDraggingProjectId(null);
      }
      return;
    }

    const currentDayKey = localDayKeyFromIso(project.due_date);
    const nextDayKey = target.type === 'day' ? target.dayKey : null;
    if (currentDayKey === nextDayKey) {
      setDraggingProjectId(null);
      return;
    }

    setMutationError(null);
    try {
      await updateProject.mutateAsync({
        id: project.id,
        patch: { due_date: dueDateForDropTarget(target) },
      });
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Failed to update due date.');
    } finally {
      setDraggingProjectId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <span className="label">Planning</span>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">Calendar</h1>
          <p className="text-sm text-muted">
            {view === 'due'
              ? 'Drag projects onto a day to set due dates at 11:00 PM.'
              : 'Drag projects onto a day to set start dates at 5:00 AM.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="segmented">
            <button
              type="button"
              data-active={view === 'due'}
              onClick={() => setView('due')}
            >
              By due date
            </button>
            <button
              type="button"
              data-active={view === 'start'}
              onClick={() => setView('start')}
            >
              By start date
            </button>
          </div>
          <div className="segmented">
            <button
              type="button"
              onClick={() => setLoadedStartMonth((prev) => addMonths(prev, -1))}
            >
              Load previous
            </button>
            <button
              type="button"
              onClick={() => setLoadedEndMonth((prev) => addMonths(prev, 1))}
            >
              Load future
            </button>
          </div>
        </div>
      </div>

      {view === 'due' ? (
        <section
          className={`card space-y-3 ${draggingProjectId ? 'ring-1 ring-border' : ''}`}
          onDragOver={(event) => {
            if (!draggingProjectId) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(event) => {
            event.preventDefault();
            void dropProject({ type: 'undated' });
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-fg">No due date</h2>
            <span className="text-xs text-muted">Drop here to clear a due date</span>
          </div>
          {undatedProjects.length === 0 ? (
            <p className="text-xs text-muted">All projects are currently scheduled.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {undatedProjects.map((project) => (
                <ProjectChip
                  key={project.id}
                  project={project}
                  tagColor={project.tag ? (tagColorByName.get(project.tag) ?? null) : null}
                  draggable
                  draggingProjectId={draggingProjectId}
                  onDragStart={setDraggingProjectId}
                  onDragEnd={() => setDraggingProjectId(null)}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {isLoading ? <p className="text-muted">Loading projects…</p> : null}
      {error ? (
        <p className="text-danger">
          {error instanceof Error ? error.message : 'Failed to load calendar projects.'}
        </p>
      ) : null}
      {mutationError ? <p className="text-danger">{mutationError}</p> : null}

      <section className="space-y-2">
        <div ref={timelineRef} className="max-h-[72vh] space-y-2 overflow-y-auto pr-1">
          <div className="sticky top-0 z-10 rounded-lg bg-bg/95 px-2 py-2 backdrop-blur">
            <h2 className="text-sm font-semibold text-fg">{monthTitle(visibleMonth)}</h2>
            <div className="mt-2 grid grid-cols-7 gap-2">
              {WEEKDAY_LABELS.map((weekday) => (
                <div
                  key={weekday}
                  className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted"
                >
                  {weekday}
                </div>
              ))}
            </div>
          </div>

          {calendarWeeks.map((week, weekIndex) => (
            <div
              key={week.key}
              ref={(element) => {
                weekRowRefs.current[weekIndex] = element;
              }}
              className="grid grid-cols-1 gap-2 sm:grid-cols-7"
            >
              {week.cells.map((cell) => {
                const dayProjects = projectsByDay.get(cell.dayKey) ?? [];
                const isToday = cell.dayKey === todayKey;
                const monthBoundaryLabel = cell.labelDay === 1
                  ? cell.date.toLocaleString([], { month: 'short' })
                  : null;
                return (
                  <div
                    key={cell.dayKey}
                    ref={isToday ? todayCellRef : undefined}
                    className={`rounded-xl border border-border bg-surface/60 p-2 min-h-28 space-y-2 ${
                      isToday ? 'ring-1 ring-accent/60' : ''
                    }`}
                    onDragOver={(event) => {
                      if (!draggingProjectId) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      void dropProject({ type: 'day', dayKey: cell.dayKey });
                    }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-medium text-fg">{cell.labelDay}</span>
                        {monthBoundaryLabel ? (
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
                            {monthBoundaryLabel}
                          </span>
                        ) : null}
                      </div>
                      {isToday ? (
                        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                          Today
                        </span>
                      ) : null}
                    </div>

                    <div className="space-y-1">
                      {dayProjects.map((project) => (
                        <ProjectChip
                          key={project.id}
                          project={project}
                          tagColor={project.tag ? (tagColorByName.get(project.tag) ?? null) : null}
                          draggable
                          endInfo={
                            view === 'start'
                              ? {
                                  endLabel: formatEndDateTime(project.due_date),
                                  durationLabel: formatDurationUntilEnd(
                                    project.start_date,
                                    project.due_date,
                                  ),
                                }
                              : undefined
                          }
                            bufferGoal={view === 'start' ? (bufferGoalByProjectId.get(project.id) ?? null) : null}
                          draggingProjectId={draggingProjectId}
                          onDragStart={setDraggingProjectId}
                          onDragEnd={() => setDraggingProjectId(null)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ProjectChip({
  project,
  tagColor,
  draggable,
  endInfo,
  bufferGoal,
  draggingProjectId,
  onDragStart,
  onDragEnd,
}: {
  project: Project;
  tagColor: string | null;
  draggable: boolean;
  endInfo?: { endLabel: string | null; durationLabel: string | null };
  bufferGoal?: number | null;
  draggingProjectId: string | null;
  onDragStart: (projectId: string) => void;
  onDragEnd: () => void;
}) {
  const isArchived = !!project.archived_at;
  const isDraggable = draggable && !isArchived;
  return (
    <div
      draggable={isDraggable}
      onDragStart={(event) => {
        if (!isDraggable) {
          event.preventDefault();
          return;
        }
        onDragStart(project.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={onDragEnd}
      className={`rounded-md border px-2 py-1 text-xs space-y-1 ${
        isArchived
          ? 'border-success/35 bg-success/15'
          : 'border-border/80 bg-bg'
      } ${
        draggingProjectId === project.id ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/projects/${project.id}`}
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          className={`block min-w-0 flex-1 truncate transition-colors ${
            isArchived ? 'text-success hover:text-success' : 'text-fg hover:text-accent'
          }`}
          title={project.name}
        >
          {project.name}
        </Link>
        {typeof bufferGoal === 'number' ? (
          <span className="shrink-0 font-sans text-[10px] text-muted" title="Buffer modifier goal">
            x{bufferGoal.toFixed(2)} goal
          </span>
        ) : null}
      </div>
      {endInfo ? (
        <div className="space-y-0.5">
          <span className="block text-[10px] text-muted">
            {endInfo.endLabel ? `Ends ${endInfo.endLabel}` : 'No due date'}
          </span>
          {endInfo.durationLabel ? (
            <span className="block text-[10px] font-medium text-fg">{endInfo.durationLabel}</span>
          ) : null}
        </div>
      ) : null}
      {isArchived ? (
        <span className="inline-flex rounded bg-success/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
          Archived
        </span>
      ) : null}
      {project.tag ? <TagPill name={project.tag} color={tagColor} /> : null}
    </div>
  );
}
