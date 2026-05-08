import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';
import { useTasksForProjects, useUpdateAnyTask } from '../hooks/useTasks';
import { useTimer } from '../hooks/useTimer';
import TimerDisplay from '../components/TimerDisplay';
import { goalProgress, progressTarget } from '../lib/calc';
import { formatHMS, parseHMS, parseHMSWithOptionalFrames } from '../lib/time';
import { playPasteChime } from '../lib/chime';
import type { Project, Task } from '../lib/types';

type SessionMode = 'idle' | 'project' | 'bulk';
const GOAL_DELTA_STORAGE_KEY = 'prime.timer.show_goal_delta';

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
  const [showGoalDelta, setShowGoalDelta] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(GOAL_DELTA_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [goalByTaskId, setGoalByTaskId] = useState<Record<string, number>>({});
  const lastGoalSnapshotStartedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!routeProjectId) return;
    setMode('project');
    setActiveProjectId(routeProjectId);
  }, [routeProjectId]);

  const projectMap = useMemo(() => {
    return new Map(projects.map((project) => [project.id, project]));
  }, [projects]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        GOAL_DELTA_STORAGE_KEY,
        String(showGoalDelta),
      );
    } catch {
      // localStorage may be unavailable; ignore persistence.
    }
  }, [showGoalDelta]);

  useEffect(() => {
    if (!timer.startedAt) {
      setGoalByTaskId({});
      lastGoalSnapshotStartedAt.current = null;
      return;
    }
    if (!tasksQ.data) return;
    const startedAtMs = timer.startedAt.getTime();
    if (lastGoalSnapshotStartedAt.current === startedAtMs) return;

    const nextGoalByTaskId: Record<string, number> = {};
    for (const task of tasksQ.data) {
      if (task.status === 'complete') continue;
      const project = projectMap.get(task.project_id);
      if (!project) continue;
      nextGoalByTaskId[task.id] = goalProgress(
        task,
        project,
        task.current_progress,
        timer.durationSeconds,
      );
    }

    setGoalByTaskId(nextGoalByTaskId);
    lastGoalSnapshotStartedAt.current = startedAtMs;
  }, [projectMap, tasksQ.data, timer.durationSeconds, timer.startedAt]);

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
        <div className="flex items-center gap-2">
          <button onClick={startBulkSession} className="btn-primary">
            Start bulk timer
          </button>
          <button
            type="button"
            onClick={() => setShowGoalDelta((value) => !value)}
            className={showGoalDelta ? 'btn-secondary' : 'btn-ghost'}
            title={
              showGoalDelta
                ? 'Showing remaining goal delta'
                : 'Showing absolute goal target'
            }
          >
            {showGoalDelta ? 'Show goal target' : 'Show goal delta'}
          </button>
        </div>
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {projects.map((project) => (
          <ProjectTimerColumn
            key={project.id}
            project={project}
            tasks={remainingByProject[project.id] ?? []}
            goalByTaskId={goalByTaskId}
            timerDurationSeconds={timer.durationSeconds}
            showGoalDelta={showGoalDelta}
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
  goalByTaskId: Record<string, number>;
  timerDurationSeconds: number;
  showGoalDelta: boolean;
  active: boolean;
  editable: boolean;
  sessionMode: SessionMode;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  onStartProjectSession: () => void;
}

function ProjectTimerColumn({
  project,
  tasks,
  goalByTaskId,
  timerDurationSeconds,
  showGoalDelta,
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
              predictedGoal={goalByTaskId[task.id]}
              timerDurationSeconds={timerDurationSeconds}
              showGoalDelta={showGoalDelta}
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
  predictedGoal,
  timerDurationSeconds,
  showGoalDelta,
  editable,
  updateTask,
}: {
  task: Task;
  project: Project;
  predictedGoal?: number;
  timerDurationSeconds: number;
  showGoalDelta: boolean;
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

  const handlePaste = async () => {
    if (!editable) return;
    setError(null);
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setError('Clipboard unavailable.');
      return;
    }
    let next: number;
    if (isCustom) {
      const value = Number.parseInt(text.trim(), 10);
      if (!Number.isFinite(value) || value < 0) {
        setError('Clipboard not a number.');
        return;
      }
      next = value;
    } else {
      const value = parseHMSWithOptionalFrames(text);
      if (value == null) {
        setError('Clipboard not hh:mm:ss[:ff].');
        return;
      }
      next = value;
    }
    try {
      if (next !== task.current_progress) {
        await updateTask(task.id, { current_progress: next });
      }
      setDraft(isCustom ? String(next) : formatHMS(next));
      playPasteChime();
    } catch {
      setError('Could not save progress.');
    }
  };

  const total = progressTarget(task, project);
  const progressLabel = isCustom
    ? `${task.current_progress} / ${total > 0 ? total : '?'}`
    : `${formatHMS(task.current_progress)} / ${
        total > 0 ? formatHMS(total) : '?'
      }`;
  const displayedGoal =
    predictedGoal ??
    goalProgress(task, project, task.current_progress, timerDurationSeconds);
  const normalizedGoal = isCustom
    ? Math.floor(displayedGoal)
    : Math.max(0, Math.round(displayedGoal));
  const goalDelta = normalizedGoal - task.current_progress;
  const deltaLabel = isCustom
    ? `${goalDelta >= 0 ? '+' : '-'}${Math.abs(goalDelta)}`
    : `${goalDelta >= 0 ? '+' : '-'}${formatHMS(Math.abs(goalDelta))}`;
  const predictionLabel = showGoalDelta
    ? `goal: ${deltaLabel}`
    : isCustom
      ? `goal: ${normalizedGoal}`
      : `goal: ${formatHMS(normalizedGoal)}`;
  const isPredictedDone =
    typeof predictedGoal === 'number' && task.current_progress >= predictedGoal;

  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        isPredictedDone
          ? 'border-success/50 bg-success/10 ring-1 ring-inset ring-success/30'
          : 'border-border/70 bg-surface2/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{task.name}</p>
          <p className="mt-0.5 text-xs font-sans tabular-nums text-subtle">
            {progressLabel}
          </p>
        </div>
        <input
          disabled={!editable}
          className={`input !w-24 shrink-0 text-right ${isCustom ? '' : 'font-sans tabular-nums'} ${!editable ? 'opacity-60' : ''}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!editable}
          onClick={handlePaste}
          className="btn-ghost h-6 px-2 text-[11px]"
          title="Paste timecode from clipboard (drops :ff frames)"
        >
          Paste
        </button>
        <span className="w-24 text-right text-[11px] text-muted">{predictionLabel}</span>
      </div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
