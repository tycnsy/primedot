import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { usePaceSettingsForProjects } from '../hooks/usePaceSettings';
import { useProjects } from '../hooks/useProjects';
import { useTasksForProjects } from '../hooks/useTasks';
import { useTicker } from '../hooks/useTicker';
import { currentPace, currentPaceEnd, paceMargin } from '../lib/calc';
import { formatHMS } from '../lib/time';
import type { Task } from '../lib/types';

function formatPaceEnd(date: Date | null): string {
  if (!date) return 'No pace end';
  return format(date, 'MMM d, h:mm a');
}

function paceTone(seconds: number): string {
  if (seconds < 0) return 'text-danger';
  if (seconds < 3600) return 'text-warn';
  return 'text-success';
}

function cardTint(seconds: number | null): string {
  if (seconds == null) return 'bg-surface/85 border-border/70';
  if (seconds < 0) return 'bg-danger/10 border-danger/35';
  if (seconds < 3600) return 'bg-warn/10 border-warn/35';
  return 'bg-success/10 border-success/35';
}

export default function ProjectsPace() {
  const now = useTicker(1000);
  const { data: projects = [], isLoading: projectsLoading, error: projectsError } =
    useProjects();
  const projectIds = projects.map((project) => project.id);
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

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <span className="label">Mobile Pace</span>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">Project Pace Grid</h1>
        <p className="text-sm text-muted">
          All projects, two columns, with live pace updates.
        </p>
      </div>

      {projectsLoading ? <p className="text-muted">Loading pace grid...</p> : null}
      {projectsError || tasksError || paceError ? (
        <p className="text-danger">
          {(projectsError ?? tasksError ?? paceError) instanceof Error
            ? (projectsError ?? tasksError ?? paceError)?.message
            : 'Could not load project pace right now.'}
        </p>
      ) : null}
      {!projectsLoading && projects.length === 0 ? (
        <div className="card text-sm text-muted">No projects yet.</div>
      ) : null}

      {projects.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 pb-4">
          {projects.map((project) => {
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

            return (
              <li key={project.id}>
                <Link
                  to={`/projects/${project.id}?tab=pace`}
                  className={`block rounded-lg border p-3 text-center transition-colors hover:border-border ${cardTint(
                    paceSeconds,
                  )}`}
                >
                  <div className="truncate text-sm font-semibold text-fg">{project.name}</div>
                  <div
                    className={`mt-2 font-sans text-lg font-semibold tabular-nums ${
                      paceSeconds == null ? 'text-muted' : paceTone(paceSeconds)
                    }`}
                  >
                    {paceSeconds == null
                      ? paceLoading || tasksLoading
                        ? 'Loading...'
                        : 'No pace'
                      : formatHMS(paceSeconds)}
                  </div>
                  <div
                    className={`mt-1 font-sans text-xs tabular-nums ${
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
                        : 'No pace'
                      : formatHMS(marginSeconds)}
                  </div>
                  <div className="mt-1 text-[11px] text-fg/90">
                    {paceLoading || tasksLoading ? 'Loading...' : formatPaceEnd(paceEnd)}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
