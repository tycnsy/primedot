import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';
import { useTasksForProjects, useUpdateAnyTask } from '../hooks/useTasks';
import { useTimer } from '../hooks/useTimer';
import TimerDisplay from '../components/TimerDisplay';
import { progressTarget } from '../lib/calc';
import { formatHMS, parseHMS } from '../lib/time';
import type { Project, Task } from '../lib/types';

type SessionMode = 'idle' | 'project' | 'bulk';

export default function Timer() {
  const { id: routeProjectId } = useParams();
  const timer = useTimer();
  const projectsQ = useProjects();
  const projects = projectsQ.data ?? [];
  const projectIds = useMemo(() => projects.map((project) => project.id), [projects]);
  const tasksQ = useTasksForProjects(projectIds);
  const updateTask = useUpdateAnyTask(projectIds);

  const [mode, setMode] = useState<SessionMode>('idle');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!routeProjectId) return;
    setMode('project');
    setActiveProjectId(routeProjectId);
  }, [routeProjectId]);

  const projectMap = useMemo(() => {
    return new Map(projects.map((project) => [project.id, project]));
  }, [projects]);

  const remainingByProject = useMemo(() => {
    const byProject: Record<string, Task[]> = {};
    for (const projectId of projectIds) byProject[projectId] = [];
    for (const task of tasksQ.data ?? []) {
      if (task.status === 'complete') continue;
      if (!byProject[task.project_id]) byProject[task.project_id] = [];
      byProject[task.project_id].push(task);
    }
    return byProject;
  }, [tasksQ.data, projectIds]);

  const modeLabel = useMemo(() => {
    if (mode === 'bulk') return 'Bulk Session: All Projects';
    if (mode === 'project') {
      const activeName = activeProjectId
        ? projectMap.get(activeProjectId)?.name
        : undefined;
      return `Project Session: ${activeName ?? 'Unknown Project'}`;
    }
    return 'Session not started';
  }, [activeProjectId, mode, projectMap]);

  const startProjectSession = (projectId: string) => {
    setMode('project');
    setActiveProjectId(projectId);
    if (!timer.running) timer.start();
  };

  const startBulkSession = () => {
    setMode('bulk');
    setActiveProjectId(null);
    if (!timer.running) timer.start();
  };

  const canEditProject = (projectId: string) =>
    mode === 'bulk' || (mode === 'project' && activeProjectId === projectId);

  if (projectsQ.isLoading || tasksQ.isLoading) {
    return <p className="text-muted">Loading…</p>;
  }

  if (projectsQ.error || tasksQ.error) {
    return (
      <div className="space-y-3">
        <p className="text-danger">Could not load timer data.</p>
        <p className="text-sm text-muted">Try refreshing this page.</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-fg">Timer</h1>
        <p className="text-muted">Create a project first to start a session.</p>
        <Link to="/projects" className="btn-primary">
          Go to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          {routeProjectId ? (
            <Link
              to={`/projects/${routeProjectId}`}
              className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
            >
              <span aria-hidden>←</span> Back to project
            </Link>
          ) : null}
          <h1 className="text-3xl font-semibold tracking-tight text-fg">Timer</h1>
          <p className="text-sm text-subtle">{modeLabel}</p>
        </div>
        <button onClick={startBulkSession} className="btn-primary">
          Start bulk timer
        </button>
      </div>

      <TimerDisplay
        durationSeconds={timer.durationSeconds}
        remaining={timer.remaining}
        running={timer.running}
        overflowed={timer.overflowed}
        onStart={timer.start}
        onPause={timer.pause}
        onReset={timer.reset}
        onChangeDuration={timer.setDurationSeconds}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <ProjectTimerColumn
            key={project.id}
            project={project}
            tasks={remainingByProject[project.id] ?? []}
            active={mode === 'project' && activeProjectId === project.id}
            editable={canEditProject(project.id)}
            sessionMode={mode}
            updateTask={async (taskId, patch) => {
              await updateTask.mutateAsync({ id: taskId, patch });
            }}
            onStartProjectSession={() => startProjectSession(project.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface ProjectTimerColumnProps {
  project: Project;
  tasks: Task[];
  active: boolean;
  editable: boolean;
  sessionMode: SessionMode;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  onStartProjectSession: () => void;
}

function ProjectTimerColumn({
  project,
  tasks,
  active,
  editable,
  sessionMode,
  updateTask,
  onStartProjectSession,
}: ProjectTimerColumnProps) {
  return (
    <div className={`card space-y-3 ${active ? 'ring-1 ring-inset ring-border' : ''}`}>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-fg">{project.name}</h2>
          <span className="pill">{tasks.length} remaining</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onStartProjectSession}
            className={active ? 'btn-secondary' : 'btn-ghost'}
          >
            {active ? 'Project session active' : 'Start project timer'}
          </button>
          <Link to={`/projects/${project.id}`} className="btn-ghost">
            Open project
          </Link>
        </div>
        {!editable ? (
          <p className="text-xs text-subtle">
            {sessionMode === 'idle'
              ? 'Start this project or a bulk session to edit progress.'
              : 'Project mode is active on another project.'}
          </p>
        ) : null}
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-md border border-border/70 bg-surface2/60 px-3 py-2 text-sm text-muted">
          No remaining tasks.
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskProgressRow
              key={task.id}
              task={task}
              project={project}
              editable={editable}
              updateTask={updateTask}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskProgressRow({
  task,
  project,
  editable,
  updateTask,
}: {
  task: Task;
  project: Project;
  editable: boolean;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
}) {
  const isCustom = task.type === 'custom';
  const [draft, setDraft] = useState(
    isCustom ? String(task.current_progress) : formatHMS(task.current_progress),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(
      isCustom
        ? String(task.current_progress)
        : formatHMS(task.current_progress),
    );
  }, [task.current_progress, isCustom]);

  const commit = async () => {
    if (!editable) return;
    setError(null);
    let next: number;
    if (isCustom) {
      const value = Number.parseInt(draft, 10);
      if (!Number.isFinite(value) || value < 0) {
        setError('Whole number.');
        return;
      }
      next = value;
    } else {
      const value = parseHMS(draft);
      if (value == null) {
        setError('hh:mm:ss');
        return;
      }
      next = value;
    }
    if (next === task.current_progress) return;
    await updateTask(task.id, { current_progress: next });
  };

  const total = progressTarget(task, project);
  const progressLabel = isCustom
    ? `${task.current_progress} / ${total > 0 ? total : '?'}`
    : `${formatHMS(task.current_progress)} / ${
        total > 0 ? formatHMS(total) : '?'
      }`;

  return (
    <div className="rounded-md border border-border/70 bg-surface2/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="pill">{task.type}</span>
        <span className="text-sm font-medium text-fg">{task.name}</span>
      </div>
      <div className="mt-1 text-xs font-sans tabular-nums text-subtle">
        {progressLabel}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          disabled={!editable}
          className={`input ${isCustom ? '' : 'font-sans tabular-nums'} ${!editable ? 'opacity-60' : ''}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <span className="text-[11px] text-muted">{task.status}</span>
      </div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
