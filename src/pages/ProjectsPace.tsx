import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import PaceGridTable from '../components/PaceGridTable';
import { usePaceSettingsForProjects } from '../hooks/usePaceSettings';
import { useHiddenPaceCards } from '../hooks/useHiddenPaceCards';
import { useProjects } from '../hooks/useProjects';
import { useTasksForProjects } from '../hooks/useTasks';
import { useTicker } from '../hooks/useTicker';
import { currentPace, currentPaceEnd, paceMargin } from '../lib/calc';
import { sortProjects } from '../lib/projectGrouping';
import { formatHMS } from '../lib/time';
import type { Task } from '../lib/types';
import { useMemo, useState } from 'react';

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
  const [activeTab, setActiveTab] = useState<'grid' | 'table'>('grid');
  const [openColumnsSignal, setOpenColumnsSignal] = useState(0);
  const now = useTicker(1000);
  const {
    hiddenProjectIds,
    hideModeProjectIds,
    isHideMode,
    toggleHideMode,
    toggleProjectHidden,
    setHiddenProjectIds,
  } = useHiddenPaceCards();
  const { data: projects = [], isLoading: projectsLoading, error: projectsError } =
    useProjects();
  const sortedProjects = useMemo(
    () => sortProjects(projects, 'due_date'),
    [projects],
  );
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
  const visibleProjects = isHideMode
    ? sortedProjects
    : sortedProjects.filter((project) => !hiddenProjectIds.has(project.id));

  const handleSetActiveProjects = () => {
    const nowMs = now.getTime();
    const hidden = new Set<string>();
    for (const project of sortedProjects) {
      const isArchived = project.archived_at != null;
      const startMs = new Date(project.start_date).getTime();
      const startedOk = !Number.isNaN(startMs) && nowMs >= startMs;
      const endMs = project.due_date ? new Date(project.due_date).getTime() : null;
      const endOk = endMs == null || nowMs <= endMs;
      const isActive = !isArchived && startedOk && endOk;
      if (!isActive) hidden.add(project.id);
    }
    setHiddenProjectIds(hidden);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <span className="label">Mobile Pace</span>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">Project Pace Grid</h1>
        <p className="text-sm text-muted">
          Two-column pace grid with shared hide controls for sidebar and timer cards.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="segmented">
          <button
            type="button"
            data-active={activeTab === 'grid'}
            onClick={() => setActiveTab('grid')}
          >
            Grid
          </button>
          <button
            type="button"
            data-active={activeTab === 'table'}
            onClick={() => setActiveTab('table')}
          >
            Table
          </button>
        </div>
        {activeTab === 'grid' ? (
          <button
            type="button"
            onClick={toggleHideMode}
            className={isHideMode ? 'btn-primary' : 'btn-ghost'}
          >
            {isHideMode ? 'Confirm hidden cards' : 'Hide cards'}
          </button>
        ) : activeTab === 'table' ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={handleSetActiveProjects}
            >
              Set active projects
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setOpenColumnsSignal((prev) => prev + 1)}
            >
              Visible columns
            </button>
          </div>
        ) : null}
      </div>

      {projectsLoading ? <p className="text-muted">Loading pace grid...</p> : null}
      {projectsError || tasksError || paceError ? (
        <p className="text-danger">
          {(projectsError ?? tasksError ?? paceError) instanceof Error
            ? (projectsError ?? tasksError ?? paceError)?.message
            : 'Could not load project pace right now.'}
        </p>
      ) : null}
      {!projectsLoading && sortedProjects.length === 0 ? (
        <div className="card text-sm text-muted">No projects yet.</div>
      ) : null}
      {activeTab === 'grid' && isHideMode ? (
        <div className="card text-sm text-muted">
          Select cards to hide from the Pace Grid, Pace sidebar, and Timer page,
          then confirm hidden cards.
        </div>
      ) : null}
      {activeTab === 'grid' &&
      !isHideMode &&
      sortedProjects.length > 0 &&
      visibleProjects.length === 0 ? (
        <div className="card text-sm text-muted">
          All pace cards are hidden. Use Hide cards to unhide projects.
        </div>
      ) : null}

      {activeTab === 'grid' && visibleProjects.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 pb-4">
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

            return (
              <li key={project.id}>
                {isHideMode ? (
                  <button
                    type="button"
                    onClick={() => toggleProjectHidden(project.id)}
                    aria-pressed={hiddenInEdit}
                    className={`block w-full rounded-lg border p-3 text-center transition-colors hover:border-border ${
                      hiddenInEdit
                        ? 'border-dashed border-border/80 bg-surface2/80 text-muted opacity-75'
                        : cardTint(paceSeconds)
                    }`}
                  >
                    <div className="truncate text-sm font-semibold text-fg">{project.name}</div>
                    <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                      {hiddenInEdit ? 'Hidden on confirm' : 'Visible on confirm'}
                    </div>
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
                  </button>
                ) : (
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
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {activeTab === 'table' ? (
        <PaceGridTable
          projects={visibleProjects}
          tasksByProject={tasksByProject}
          paceByProject={paceByProject}
          now={now}
          isLoading={tasksLoading || paceLoading}
          openColumnsSignal={openColumnsSignal}
        />
      ) : null}
    </div>
  );
}
