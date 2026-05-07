import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { currentPace, currentPaceEnd, paceMargin } from '../lib/calc';
import { formatHMS } from '../lib/time';
import { useProjects } from '../hooks/useProjects';
import { usePaceSettingsForProjects } from '../hooks/usePaceSettings';
import { useTasksForProjects } from '../hooks/useTasks';
import { useTicker } from '../hooks/useTicker';
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

export default function RightPaceSidebar() {
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

  if (projects.length === 0) {
    return <div className="p-3 text-xs text-muted">No projects yet.</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
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
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className={`block rounded-lg border p-3 text-center transition-colors hover:border-border ${paceTint(
                paceSeconds,
              )}`}
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
          );
        })}
      </div>
    </div>
  );
}
