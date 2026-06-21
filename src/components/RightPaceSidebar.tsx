import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { currentPace, currentPaceEnd, paceMargin } from '../lib/calc';
import { sortProjects } from '../lib/projectGrouping';
import { paceEligibleProjects } from '../lib/projects';
import { formatHMS } from '../lib/time';
import { useProjects } from '../hooks/useProjects';
import { usePaceSettingsForProjects } from '../hooks/usePaceSettings';
import { useTasksForProjects } from '../hooks/useTasks';
import { useTicker } from '../hooks/useTicker';
import { useHiddenPaceCards } from '../hooks/useHiddenPaceCards';
import type { Task } from '../lib/types';

function formatPaceEnd(date: Date | null): string {
  if (!date) return 'No pace end';
  return format(date, 'MMM d, h:mm a');
}

function metricTone(seconds: number): string {
  if (seconds < 0) return 'text-danger';
  if (seconds < 3600) return 'text-warn';
  return 'text-success';
}

function paceTint(seconds: number | null): string {
  if (seconds == null) return 'bg-surface/85 border-border/70';
  if (seconds < 0) return 'bg-danger/10 border-danger/35';
  if (seconds < 3600) return 'bg-warn/10 border-warn/35';
  return 'bg-success/10 border-success/35';
}

export default function RightPaceSidebar({
  isHideMode,
}: {
  isHideMode: boolean;
}) {
  const now = useTicker(1000);
  const { data: projects = [], isLoading: projectsLoading, error: projectsError } =
    useProjects();
  const sortedProjects = useMemo(
    () => sortProjects(paceEligibleProjects(projects), 'due_date'),
    [projects],
  );
  const { hideModeProjectIds, hiddenProjectIds, toggleProjectHidden } =
    useHiddenPaceCards();

  const projectIds = sortedProjects.map((project) => project.id);
  const {
    data: tasks = [],
    isLoading: tasksLoading,
    error: tasksError,
  } = useTasksForProjects(projectIds);
  const {
    data: paceByProject = {},
    isLoading: paceLoading,
    error: paceError,
  } = usePaceSettingsForProjects(projectIds);

  const tasksByProject = tasks.reduce<Record<string, Task[]>>((acc, task) => {
    if (!acc[task.project_id]) acc[task.project_id] = [];
    acc[task.project_id].push(task);
    return acc;
  }, {});

  if (projectsLoading) {
    return (
      <div className="p-3 text-xs text-muted" role="status">
        Loading pace cards...
      </div>
    );
  }

  if (projectsError || tasksError || paceError) {
    return (
      <div className="p-3 text-xs text-danger">
        Could not load pace cards right now.
      </div>
    );
  }

  if (sortedProjects.length === 0) {
    return <div className="p-3 text-xs text-muted">No projects yet.</div>;
  }

  const visibleProjects = isHideMode
    ? sortedProjects
    : sortedProjects.filter((project) => !hiddenProjectIds.has(project.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {isHideMode ? (
          <div className="rounded-md border border-border/70 bg-surface2/40 px-2.5 py-2 text-[11px] text-muted">
            Select cards to hide from Pace Grid, this sidebar, and the Timer page,
            then confirm below.
          </div>
        ) : null}

        {!isHideMode && visibleProjects.length === 0 ? (
          <div className="rounded-md border border-border/70 bg-surface2/40 px-3 py-2 text-xs text-muted">
            All pace cards are hidden. Use Hide cards below to unhide any card.
          </div>
        ) : null}

        {visibleProjects.map((project) => {
          const pace = paceByProject[project.id];
          const projectTasks = tasksByProject[project.id] ?? [];
          const showComputed = !!pace && !tasksLoading && !paceLoading;
          const paceSeconds = showComputed
            ? currentPace(projectTasks, project, pace, now)
            : null;
          const marginSeconds = showComputed ? paceMargin(pace) : null;
          const paceEnd = showComputed
            ? currentPaceEnd(projectTasks, project, pace)
            : null;
          const hiddenInEdit = hideModeProjectIds.has(project.id);
          const cardTint = paceTint(paceSeconds);

          return (
            isHideMode ? (
              <button
                key={project.id}
                type="button"
                onClick={() => toggleProjectHidden(project.id)}
                className={`block w-full rounded-lg border p-3 text-center transition-colors hover:border-border ${
                  hiddenInEdit
                    ? 'border-dashed border-border/80 bg-surface2/80 text-muted opacity-75'
                    : cardTint
                }`}
                aria-pressed={hiddenInEdit}
              >
                <div className="text-base font-semibold text-fg">{project.name}</div>
                <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                  {hiddenInEdit ? 'Hidden on confirm' : 'Visible on confirm'}
                </div>
                <div
                  className={`mt-2 font-sans text-2xl font-semibold tabular-nums ${
                    paceSeconds == null ? 'text-muted' : metricTone(paceSeconds)
                  }`}
                >
                  {paceSeconds == null
                    ? paceLoading || tasksLoading
                      ? 'Loading...'
                      : 'No pace set'
                    : formatHMS(paceSeconds)}
                </div>
                <div
                  className={`mt-1 font-sans text-sm tabular-nums ${
                    marginSeconds == null
                      ? 'text-muted'
                      : marginSeconds < 0
                        ? 'text-danger'
                        : 'text-fg'
                  }`}
                >
                  {marginSeconds == null
                    ? paceLoading || tasksLoading
                      ? 'Loading...'
                      : 'No pace set'
                    : formatHMS(marginSeconds)}
                </div>
                <div className="mt-1 text-xs text-fg/90">
                  {paceLoading || tasksLoading ? 'Loading...' : formatPaceEnd(paceEnd)}
                </div>
              </button>
            ) : (
              <Link
                key={project.id}
                to={`/projects/${project.id}?tab=pace`}
                className={`block rounded-lg border p-3 text-center transition-colors hover:border-border ${cardTint}`}
              >
                <div className="text-base font-semibold text-fg">{project.name}</div>
                <div
                  className={`mt-2 font-sans text-2xl font-semibold tabular-nums ${
                    paceSeconds == null ? 'text-muted' : metricTone(paceSeconds)
                  }`}
                >
                  {paceSeconds == null
                    ? paceLoading || tasksLoading
                      ? 'Loading...'
                      : 'No pace set'
                    : formatHMS(paceSeconds)}
                </div>
                <div
                  className={`mt-1 font-sans text-sm tabular-nums ${
                    marginSeconds == null
                      ? 'text-muted'
                      : marginSeconds < 0
                        ? 'text-danger'
                        : 'text-fg'
                  }`}
                >
                  {marginSeconds == null
                    ? paceLoading || tasksLoading
                      ? 'Loading...'
                      : 'No pace set'
                    : formatHMS(marginSeconds)}
                </div>
                <div className="mt-1 text-xs text-fg/90">
                  {paceLoading || tasksLoading ? 'Loading...' : formatPaceEnd(paceEnd)}
                </div>
              </Link>
            )
          );
        })}
      </div>
    </div>
  );
}
