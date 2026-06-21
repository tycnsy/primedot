import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePaceSettingsForProjects, useUpsertPaceSettings } from '../hooks/usePaceSettings';
import { useProjects } from '../hooks/useProjects';
import { useTasksForProjects, useUpdateAnyTask } from '../hooks/useTasks';
import { useTimer } from '../hooks/useTimer';
import { useHiddenPaceCards } from '../hooks/useHiddenPaceCards';
import TimerDisplay from '../components/TimerDisplay';
import {
  complexParentEffectiveModifier,
  complexParentEffectiveProgress,
  deriveTaskStatus,
  goalProgress,
  progressTarget,
  taskLength,
} from '../lib/calc';
import { buildPacePatchFromBufferSeconds } from '../lib/pace';
import { formatHMS, parseHMS, parseHMSWithOptionalFrames } from '../lib/time';
import { playPasteChime } from '../lib/chime';
import type { PaceSettings, Project, Task } from '../lib/types';
import { paceEligibleProjects } from '../lib/projects';

type SessionMode = 'idle' | 'project' | 'bulk';
const GOAL_DELTA_STORAGE_KEY = 'prime.timer.show_goal_delta';
const PACE_MODIFIER_STORAGE_KEY = 'prime.timer.pace_modifier';
type GoalSnapshot = {
  projectedGoal: number;
  startProgress: number;
};

const parsePaceModifier = (raw: string | null): number => {
  if (raw == null) return 1;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(0, parsed);
};

export default function Timer() {
  const { id: routeProjectId } = useParams();
  const timer = useTimer();
  const projectsQ = useProjects();
  const projects = projectsQ.data ?? [];
  const paceProjects = useMemo(() => paceEligibleProjects(projects), [projects]);
  const { hiddenProjectIds } = useHiddenPaceCards();
  const visibleProjects = useMemo(
    () => paceProjects.filter((project) => !hiddenProjectIds.has(project.id)),
    [paceProjects, hiddenProjectIds],
  );
  const projectIds = useMemo(() => paceProjects.map((project) => project.id), [paceProjects]);
  const tasksQ = useTasksForProjects(projectIds);
  const paceByProjectQ = usePaceSettingsForProjects(projectIds);
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
  const [paceModifier, setPaceModifier] = useState<number>(() => {
    if (typeof window === 'undefined') return 1;
    try {
      return parsePaceModifier(
        window.localStorage.getItem(PACE_MODIFIER_STORAGE_KEY),
      );
    } catch {
      return 1;
    }
  });
  const [goalSnapshotByTaskId, setGoalSnapshotByTaskId] = useState<
    Record<string, GoalSnapshot>
  >({});
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
    try {
      window.localStorage.setItem(
        PACE_MODIFIER_STORAGE_KEY,
        String(paceModifier),
      );
    } catch {
      // localStorage may be unavailable; ignore persistence.
    }
  }, [paceModifier]);

  useEffect(() => {
    if (!timer.startedAt) {
      setGoalSnapshotByTaskId({});
      lastGoalSnapshotStartedAt.current = null;
      return;
    }
    if (!tasksQ.data) return;
    const startedAtMs = timer.startedAt.getTime();
    if (lastGoalSnapshotStartedAt.current === startedAtMs) return;

    const allTasks = tasksQ.data;
    const nextGoalSnapshotByTaskId: Record<string, GoalSnapshot> = {};
    for (const task of allTasks) {
      const project = projectMap.get(task.project_id);
      if (!project) continue;
      if (task.complex_mode === 'expanded') continue;
      if (deriveTaskStatus(task, project, allTasks) === 'complete') continue;
      const startProgress =
        task.complex_mode === 'compressed'
          ? complexParentEffectiveProgress(task, allTasks)
          : task.current_progress;
      nextGoalSnapshotByTaskId[task.id] = {
        projectedGoal: goalProgress(
          task,
          project,
          startProgress,
          timer.durationSeconds,
          paceModifier,
          allTasks,
        ),
        startProgress,
      };
    }

    setGoalSnapshotByTaskId(nextGoalSnapshotByTaskId);
    lastGoalSnapshotStartedAt.current = startedAtMs;
  }, [paceModifier, projectMap, tasksQ.data, timer.durationSeconds, timer.startedAt]);

  const allTasks = tasksQ.data ?? [];

  const remainingByProject = useMemo(() => {
    const byProject: Record<string, Task[]> = {};
    for (const projectId of projectIds) byProject[projectId] = [];
    for (const task of allTasks) {
      const project = projectMap.get(task.project_id);
      if (!project) continue;
      // Skip expanded parents (they are headers only).
      if (task.complex_mode === 'expanded') {
        // Still allow the parent to be rendered as a non-editable header by
        // including it; ProjectTimerColumn will render headers separately.
        if (!byProject[task.project_id]) byProject[task.project_id] = [];
        byProject[task.project_id].push(task);
        continue;
      }
      // Skip subtasks whose parent is currently compressed (parent represents them).
      if (task.parent_id) {
        const parent = allTasks.find((t) => t.id === task.parent_id);
        if (parent && parent.complex_mode === 'compressed') continue;
      }
      if (deriveTaskStatus(task, project, allTasks) === 'complete') continue;
      if (!byProject[task.project_id]) byProject[task.project_id] = [];
      byProject[task.project_id].push(task);
    }
    return byProject;
  }, [projectIds, projectMap, allTasks]);

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

  if (projectsQ.isLoading || tasksQ.isLoading || paceByProjectQ.isLoading) {
    return <p className="text-muted">Loading…</p>;
  }

  if (projectsQ.error || tasksQ.error || paceByProjectQ.error) {
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

  if (visibleProjects.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-fg">Timer</h1>
        <p className="text-muted">
          All timer cards are hidden. Use Hide cards in the Pace sidebar to show
          cards again.
        </p>
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

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-subtle">
          Pace modifier scales goal projections for this timer page.
        </p>
        <label
          htmlFor="pace-modifier"
          className="flex items-center gap-2 text-sm text-fg"
        >
          Pace modifier
          <input
            id="pace-modifier"
            type="number"
            min="0"
            step="0.1"
            value={paceModifier}
            onChange={(event) => {
              const next = Number.parseFloat(event.target.value);
              if (!Number.isFinite(next)) return;
              setPaceModifier(Math.max(0, next));
            }}
            className="input h-8 w-24 text-right font-sans tabular-nums"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {visibleProjects.map((project) => (
          <ProjectTimerColumn
            key={project.id}
            project={project}
            tasks={remainingByProject[project.id] ?? []}
            allTasks={allTasks}
            goalSnapshotByTaskId={goalSnapshotByTaskId}
            timerDurationSeconds={timer.durationSeconds}
            paceModifier={paceModifier}
            showGoalDelta={showGoalDelta}
            active={mode === 'project' && activeProjectId === project.id}
            updateTask={async (taskId, patch) => {
              await updateTask.mutateAsync({ id: taskId, patch });
            }}
            pace={paceByProjectQ.data?.[project.id] ?? null}
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
  allTasks: Task[];
  goalSnapshotByTaskId: Record<string, GoalSnapshot>;
  timerDurationSeconds: number;
  paceModifier: number;
  showGoalDelta: boolean;
  active: boolean;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  pace: PaceSettings | null;
  onStartProjectSession: () => void;
}

function ProjectTimerColumn({
  project,
  tasks,
  allTasks,
  goalSnapshotByTaskId,
  timerDurationSeconds,
  paceModifier,
  showGoalDelta,
  active,
  updateTask,
  pace,
  onStartProjectSession,
}: ProjectTimerColumnProps) {
  const upsertPace = useUpsertPaceSettings(project.id);
  const [paceError, setPaceError] = useState<string | null>(null);

  const handleSetPaceShortcut = async () => {
    setPaceError(null);
    const { patch } = buildPacePatchFromBufferSeconds(tasks, project, 120, pace?.true_deadline);
    try {
      await upsertPace.mutateAsync(patch);
    } catch (e) {
      setPaceError(e instanceof Error ? e.message : 'Failed to set pace.');
    }
  };

  return (
    <div className={`card space-y-3 ${active ? 'ring-1 ring-inset ring-border' : ''}`}>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-fg">{project.name}</h2>
          <button
            type="button"
            onClick={handleSetPaceShortcut}
            disabled={upsertPace.isPending}
            className="btn-secondary h-7 px-2 text-xs whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-70"
          >
            {upsertPace.isPending ? 'Setting pace…' : 'Set pace +2 min'}
          </button>
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
        {paceError ? <p className="text-xs text-danger">{paceError}</p> : null}
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-md border border-border/70 bg-surface2/60 px-3 py-2 text-sm text-muted">
          No remaining tasks.
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            if (task.complex_mode === 'expanded') {
              return (
                <ComplexParentHeader
                  key={task.id}
                  task={task}
                  project={project}
                  allTasks={allTasks}
                />
              );
            }
            return (
              <TaskProgressRow
                key={task.id}
                task={task}
                project={project}
                allTasks={allTasks}
                predictedGoal={goalSnapshotByTaskId[task.id]?.projectedGoal}
                predictedStartProgress={goalSnapshotByTaskId[task.id]?.startProgress}
                timerDurationSeconds={timerDurationSeconds}
                paceModifier={paceModifier}
                showGoalDelta={showGoalDelta}
                updateTask={updateTask}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ComplexParentHeader({
  task,
  project,
  allTasks,
}: {
  task: Task;
  project: Project;
  allTasks: Task[];
}) {
  const modifier = complexParentEffectiveModifier(task, allTasks);
  const length = taskLength(task, project, allTasks);
  return (
    <div className="rounded-md border border-dashed border-border/70 bg-surface2/40 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{task.name}</p>
          <p className="mt-0.5 text-[11px] text-muted">
            complex · ×{modifier.toFixed(2)} · {formatHMS(length)}
          </p>
        </div>
      </div>
    </div>
  );
}

function TaskProgressRow({
  task,
  project,
  allTasks,
  predictedGoal,
  predictedStartProgress,
  timerDurationSeconds,
  paceModifier,
  showGoalDelta,
  updateTask,
}: {
  task: Task;
  project: Project;
  allTasks: Task[];
  predictedGoal?: number;
  predictedStartProgress?: number;
  timerDurationSeconds: number;
  paceModifier: number;
  showGoalDelta: boolean;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
}) {
  const isCustom = task.type === 'custom';
  const isCompressedParent = task.complex_mode === 'compressed';
  const isSubtask = !!task.parent_id;

  const effectiveProgress = isCompressedParent
    ? complexParentEffectiveProgress(task, allTasks)
    : task.current_progress;

  const [draft, setDraft] = useState(
    isCustom ? String(effectiveProgress) : formatHMS(effectiveProgress),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(
      isCustom ? String(effectiveProgress) : formatHMS(effectiveProgress),
    );
  }, [effectiveProgress, isCustom]);

  const commit = async () => {
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
    if (next === effectiveProgress) return;
    await updateTask(task.id, {
      current_progress: next,
      status: deriveTaskStatus(
        { ...task, current_progress: next },
        project,
        allTasks,
      ),
    });
  };

  const handlePaste = async () => {
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
      if (next !== effectiveProgress) {
        await updateTask(task.id, {
          current_progress: next,
          status: deriveTaskStatus(
            { ...task, current_progress: next },
            project,
            allTasks,
          ),
        });
      }
      setDraft(isCustom ? String(next) : formatHMS(next));
      playPasteChime();
    } catch {
      setError('Could not save progress.');
    }
  };

  const total = progressTarget(task, project);
  const progressLabel = isCustom
    ? `${effectiveProgress} / ${total > 0 ? total : '?'}`
    : `${formatHMS(effectiveProgress)} / ${
        total > 0 ? formatHMS(total) : '?'
      }`;
  const displayedGoal =
    predictedGoal ??
    goalProgress(
      task,
      project,
      effectiveProgress,
      timerDurationSeconds,
      paceModifier,
      allTasks,
    );
  const normalizedGoal = isCustom
    ? Math.floor(displayedGoal)
    : Math.max(0, Math.round(displayedGoal));
  const baselineProgress =
    typeof predictedStartProgress === 'number'
      ? predictedStartProgress
      : effectiveProgress;
  const goalDelta = normalizedGoal - baselineProgress;
  const deltaLabel = isCustom
    ? `${goalDelta >= 0 ? '+' : '-'}${Math.abs(goalDelta)}`
    : `${goalDelta >= 0 ? '+' : '-'}${formatHMS(Math.abs(goalDelta))}`;
  const predictionLabel = showGoalDelta
    ? `goal: ${deltaLabel}`
    : isCustom
      ? `goal: ${normalizedGoal}`
      : `goal: ${formatHMS(normalizedGoal)}`;
  const isPredictedDone =
    typeof predictedGoal === 'number' && effectiveProgress >= predictedGoal;

  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        isSubtask ? 'ml-4 border-l-2 border-l-accent/30' : ''
      } ${
        isPredictedDone
          ? 'border-success/50 bg-success/10 ring-1 ring-inset ring-success/30'
          : 'border-border/70 bg-surface2/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">
            {isSubtask ? <span className="pill mr-1">subtask</span> : null}
            {isCompressedParent ? (
              <span className="pill mr-1">complex</span>
            ) : null}
            {task.name}
          </p>
          <p className="mt-0.5 text-xs font-sans tabular-nums text-subtle">
            {progressLabel}
          </p>
        </div>
        <input
          className={`input !w-24 shrink-0 text-right ${isCustom ? '' : 'font-sans tabular-nums'}`}
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
