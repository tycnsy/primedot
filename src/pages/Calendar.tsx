import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { dueDateForDropTarget, localDayKeyFromDate, localDayKeyFromIso } from '../lib/calendarDueDate';
import { useProjects, useUpdateProject } from '../hooks/useProjects';
import type { Project } from '../lib/types';

type CalendarCell = {
  dayKey: string;
  labelDay: number;
  inCurrentMonth: boolean;
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function monthTitle(date: Date): string {
  return date.toLocaleString([], { month: 'long', year: 'numeric' });
}

function buildMonthCells(monthDate: Date): CalendarCell[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  const gridEnd = new Date(year, month, lastOfMonth.getDate() + (6 - lastOfMonth.getDay()));

  const cells: CalendarCell[] = [];
  for (const cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
    cells.push({
      dayKey: localDayKeyFromDate(cursor),
      labelDay: cursor.getDate(),
      inCurrentMonth: cursor.getMonth() === month,
    });
  }
  return cells;
}

function buildProjectsByDay(projects: Project[]): Map<string, Project[]> {
  const byDay = new Map<string, Project[]>();
  for (const project of projects) {
    const dayKey = localDayKeyFromIso(project.due_date);
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

export default function Calendar() {
  const { data: projects = [], isLoading, error } = useProjects();
  const updateProject = useUpdateProject();
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const undatedProjects = useMemo(
    () => projects.filter((project) => localDayKeyFromIso(project.due_date) == null),
    [projects],
  );
  const projectsByDay = useMemo(() => buildProjectsByDay(projects), [projects]);
  const monthCells = useMemo(() => buildMonthCells(currentMonth), [currentMonth]);
  const todayKey = useMemo(() => localDayKeyFromDate(new Date()), []);

  const dropProject = async (target: { type: 'undated' } | { type: 'day'; dayKey: string }) => {
    if (!draggingProjectId) return;
    const project = projects.find((item) => item.id === draggingProjectId);
    if (!project) {
      setDraggingProjectId(null);
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
          <p className="text-sm text-muted">Drag projects onto a day to set due dates at 11:00 PM.</p>
        </div>
        <div className="segmented">
          <button
            type="button"
            className="segmented-item"
            onClick={() =>
              setCurrentMonth(
                (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
              )
            }
          >
            Prev
          </button>
          <div className="px-3 py-1.5 text-sm font-medium text-fg">{monthTitle(currentMonth)}</div>
          <button
            type="button"
            className="segmented-item"
            onClick={() =>
              setCurrentMonth(
                (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
              )
            }
          >
            Next
          </button>
        </div>
      </div>

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
                draggingProjectId={draggingProjectId}
                onDragStart={setDraggingProjectId}
                onDragEnd={() => setDraggingProjectId(null)}
              />
            ))}
          </div>
        )}
      </section>

      {isLoading ? <p className="text-muted">Loading projects…</p> : null}
      {error ? (
        <p className="text-danger">
          {error instanceof Error ? error.message : 'Failed to load calendar projects.'}
        </p>
      ) : null}
      {mutationError ? <p className="text-danger">{mutationError}</p> : null}

      <section className="space-y-2">
        <div className="grid grid-cols-7 gap-2">
          {WEEKDAY_LABELS.map((weekday) => (
            <div key={weekday} className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted">
              {weekday}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
          {monthCells.map((cell) => {
            const dayProjects = projectsByDay.get(cell.dayKey) ?? [];
            const isToday = cell.dayKey === todayKey;
            return (
              <div
                key={cell.dayKey}
                className={`rounded-xl border p-2 min-h-28 space-y-2 ${
                  cell.inCurrentMonth ? 'border-border bg-surface/60' : 'border-border/70 bg-surface2/50'
                } ${isToday ? 'ring-1 ring-accent/60' : ''}`}
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
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${cell.inCurrentMonth ? 'text-fg' : 'text-muted'}`}>
                    {cell.labelDay}
                  </span>
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
      </section>
    </div>
  );
}

function ProjectChip({
  project,
  draggingProjectId,
  onDragStart,
  onDragEnd,
}: {
  project: Project;
  draggingProjectId: string | null;
  onDragStart: (projectId: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(event) => {
        onDragStart(project.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={onDragEnd}
      className={`rounded-md border border-border/80 bg-bg px-2 py-1 text-xs ${
        draggingProjectId === project.id ? 'opacity-60' : ''
      }`}
    >
      <Link
        to={`/projects/${project.id}`}
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
        className="block truncate text-fg hover:text-accent transition-colors"
        title={project.name}
      >
        {project.name}
      </Link>
    </div>
  );
}
