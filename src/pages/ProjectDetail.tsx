import { useEffect, useMemo, useState } from 'react';
import { subDays } from 'date-fns';
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  useArchiveProject,
  useCreateProject,
  useDeleteProject,
  useProject,
  useProjectSeries,
  useProjectTags,
  useRestoreProject,
  useSubprojects,
  useUpdateProject,
} from '../hooks/useProjects';
import {
  useConvertToComplex,
  useCreateTask,
  useDeleteTask,
  useReorderTasks,
  useSaveComplexSettings,
  useTasks,
  useTasksForProjects,
  useToggleComplexMode,
  useUpdateAnyTask,
  useUpdateTask,
} from '../hooks/useTasks';
import { usePaceSettings } from '../hooks/usePaceSettings';
import { useRealtimeLogs } from '../hooks/useRealtimeLogs';
import { useCreateTemplateFromProject } from '../hooks/useTemplates';
import ProjectForm from '../components/ProjectForm';
import TagPill from '../components/TagPill';
import TaskForm from '../components/TaskForm';
import TaskRow from '../components/TaskRow';
import PaceDisplay from '../components/PaceDisplay';
import PaceSettingsForm from '../components/PaceSettingsForm';
import RebalanceModal from '../components/RebalanceModal';
import ComplexTaskSettingsModal from '../components/ComplexTaskSettingsModal';
import ComplexCollapseConflictModal from '../components/ComplexCollapseConflictModal';
import HeatmapGrid from '../components/heatmap/HeatmapGrid';
import RealtimeLogsTab from '../components/heatmap/RealtimeLogsTab';
import {
  bufferModifierGoal,
  deriveTaskStatus,
  getSubtasks,
  projectProgress,
  progressTarget,
  remainingProgress,
  subtasksHaveProgressMismatch,
  totalTaskLength,
} from '../lib/calc';
import { isParentProject, resolvedProjectTagSeries } from '../lib/projects';
import { formatHMS } from '../lib/time';
import type { ComplexMode, Project, Task } from '../lib/types';

const NOTES_AUTOSAVE_DELAY_MS = 700;
const EMPTY_TASKS: Task[] = [];
const PROJECT_HEATMAP_WEEKS = 52;
const PROJECT_LOGS_DEFAULT_LIMIT = 250;

function formatDueDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function reorderTasks(tasks: Task[], sourceId: string, targetId: string): Task[] {
  if (sourceId === targetId) return tasks;

  const sourceIndex = tasks.findIndex((task) => task.id === sourceId);
  const targetIndex = tasks.findIndex((task) => task.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return tasks;

  const next = [...tasks];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

function hasSameTaskIds(a: Task[], b: Task[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].id !== b[i].id) return false;
  }
  return true;
}

function topLevelTasksOf(tasks: Task[]): Task[] {
  return tasks
    .filter((task) => !task.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

function subtasksByParentOf(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.parent_id) continue;
    const arr = map.get(task.parent_id) ?? [];
    arr.push(task);
    map.set(task.parent_id, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.sort_order - b.sort_order);
  }
  return map;
}

export default function ProjectDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const navigate = useNavigate();
  const project = useProject(id);
  const parentProject = useProject(project.data?.parent_id ?? undefined);
  const subprojectsQuery = useSubprojects(
    project.data && isParentProject(project.data) ? project.data.id : undefined,
  );
  const subprojects = subprojectsQuery.data ?? [];
  const subprojectIds = useMemo(
    () => subprojects.map((subproject) => subproject.id),
    [subprojects],
  );
  const subprojectTasksQuery = useTasksForProjects(subprojectIds);
  const updateAnySubprojectTask = useUpdateAnyTask(subprojectIds);
  const subprojectTasksById = useMemo(() => {
    const byProject = new Map<string, Task[]>();
    for (const task of subprojectTasksQuery.data ?? []) {
      const existing = byProject.get(task.project_id);
      if (existing) {
        existing.push(task);
      } else {
        byProject.set(task.project_id, [task]);
      }
    }
    return byProject;
  }, [subprojectTasksQuery.data]);
  const createSubproject = useCreateProject();
  const projectTags = useProjectTags();
  const projectSeries = useProjectSeries();
  const tasks = useTasks(id);
  const pace = usePaceSettings(id);
  const updateProject = useUpdateProject();
  const archiveProject = useArchiveProject();
  const restoreProject = useRestoreProject();
  const deleteProject = useDeleteProject();
  const createTask = useCreateTask(id ?? '');
  const updateTask = useUpdateTask(id ?? '');
  const deleteTask = useDeleteTask(id ?? '');
  const reorderTasksMutation = useReorderTasks(id ?? '');
  const toggleComplexMode = useToggleComplexMode(id ?? '');
  const saveComplexSettings = useSaveComplexSettings(id ?? '');
  const convertToComplex = useConvertToComplex(id ?? '');
  const createTemplate = useCreateTemplateFromProject();

  const [editingProject, setEditingProject] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingTaskProject, setEditingTaskProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'pace' | 'heatmap'>(
    'overview',
  );
  const [projectHeatmapSubTab, setProjectHeatmapSubTab] = useState<'heatmap' | 'logs'>(
    'heatmap',
  );
  const [projectLogsLimit, setProjectLogsLimit] = useState(PROJECT_LOGS_DEFAULT_LIMIT);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesError, setNotesError] = useState<string | null>(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showNewSubproject, setShowNewSubproject] = useState(false);
  const [subprojectError, setSubprojectError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [orderedTasks, setOrderedTasks] = useState<Task[]>([]);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [showRebalanceModal, setShowRebalanceModal] = useState(false);
  const [complexSettingsFor, setComplexSettingsFor] = useState<{
    parent: Task;
    mode: 'convert' | 'edit';
  } | null>(null);
  const [collapseConflictFor, setCollapseConflictFor] = useState<Task | null>(
    null,
  );
  const [bufferVisibility, setBufferVisibility] = useState(false);
  const allTasks = tasks.data ?? EMPTY_TASKS;
  const tagColorByName = new Map(
    (projectTags.data ?? []).map((tag) => [tag.name, tag.color] as const),
  );
  const seriesColorByName = new Map(
    (projectSeries.data ?? []).map((series) => [series.name, series.color] as const),
  );

  useEffect(() => {
    setOrderedTasks(tasks.data ?? EMPTY_TASKS);
  }, [tasks.data]);

  const heatmapSince = useMemo(
    () => subDays(new Date(), PROJECT_HEATMAP_WEEKS * 7).toISOString(),
    [],
  );
  const projectHeatmapLogsQuery = useRealtimeLogs({
    projectId: id,
    since: heatmapSince,
  });
  const projectLogsQuery = useRealtimeLogs({
    projectId: id,
    limit: projectLogsLimit,
  });

  useEffect(() => {
    const nextTab =
      requestedTab === 'pace' ||
      requestedTab === 'notes' ||
      requestedTab === 'heatmap'
        ? requestedTab
        : 'overview';
    setActiveTab(nextTab);
  }, [id, requestedTab]);

  useEffect(() => {
    setNotesDraft(project.data?.notes ?? '');
    setNotesError(null);
  }, [project.data?.id, project.data?.notes]);

  const topLevelTasks = orderedTasks.filter((t) => !t.parent_id);
  const subtasksByParent = new Map<string, Task[]>();
  for (const t of orderedTasks) {
    if (!t.parent_id) continue;
    const arr = subtasksByParent.get(t.parent_id) ?? [];
    arr.push(t);
    subtasksByParent.set(t.parent_id, arr);
  }
  for (const arr of subtasksByParent.values()) {
    arr.sort((a, b) => a.sort_order - b.sort_order);
  }

  const handleDropOnTopLevel = (targetId: string) => {
    if (!draggingTaskId) return;
    const draggedTask = orderedTasks.find((t) => t.id === draggingTaskId);
    const targetTask = orderedTasks.find((t) => t.id === targetId);
    if (!draggedTask || !targetTask) return;
    if (draggedTask.parent_id || targetTask.parent_id) return;

    const nextTop = reorderTasks(topLevelTasks, draggingTaskId, targetId);
    setDraggingTaskId(null);
    if (nextTop === topLevelTasks) return;

    const merged: Task[] = [];
    for (const top of nextTop) {
      merged.push(top);
      const subs = subtasksByParent.get(top.id);
      if (subs) merged.push(...subs);
    }
    if (hasSameTaskIds(merged, orderedTasks)) return;
    setOrderedTasks(merged);
    setReorderError(null);
    reorderTasksMutation.mutate(merged.map((t) => t.id), {
      onError: (error) => {
        setReorderError(
          error instanceof Error ? error.message : 'Failed to reorder tasks.',
        );
      },
    });
  };

  const handleDropOnSubtask = (targetId: string) => {
    if (!draggingTaskId) return;
    const draggedTask = orderedTasks.find((t) => t.id === draggingTaskId);
    const targetTask = orderedTasks.find((t) => t.id === targetId);
    if (!draggedTask || !targetTask) return;
    if (draggedTask.parent_id !== targetTask.parent_id) return;
    if (!draggedTask.parent_id) return;

    const siblings = subtasksByParent.get(draggedTask.parent_id) ?? [];
    const nextSiblings = reorderTasks(siblings, draggingTaskId, targetId);
    setDraggingTaskId(null);
    if (nextSiblings === siblings) return;

    const merged: Task[] = [];
    for (const top of topLevelTasks) {
      merged.push(top);
      if (top.id === draggedTask.parent_id) {
        merged.push(...nextSiblings);
      } else {
        const subs = subtasksByParent.get(top.id);
        if (subs) merged.push(...subs);
      }
    }
    if (hasSameTaskIds(merged, orderedTasks)) return;
    setOrderedTasks(merged);
    setReorderError(null);
    reorderTasksMutation.mutate(merged.map((t) => t.id), {
      onError: (error) => {
        setReorderError(
          error instanceof Error ? error.message : 'Failed to reorder tasks.',
        );
      },
    });
  };

  const attemptCompress = (parent: Task) => {
    if (subtasksHaveProgressMismatch(parent, allTasks)) {
      setCollapseConflictFor(parent);
      return;
    }
    const subs = getSubtasks(parent.id, allTasks);
    const chosen = subs[0]?.current_progress ?? parent.current_progress;
    void toggleComplexMode.mutateAsync({
      parentId: parent.id,
      mode: 'compressed',
      chosenProgress: chosen,
    });
  };

  const handleToggleMode = (parent: Task, next: ComplexMode) => {
    if (next === 'expanded') {
      void toggleComplexMode.mutateAsync({
        parentId: parent.id,
        mode: 'expanded',
      });
      return;
    }
    attemptCompress(parent);
  };

  const handleCompressFromSubtask = (sub: Task) => {
    if (!sub.parent_id) return;
    const parent = allTasks.find((t) => t.id === sub.parent_id);
    if (!parent) return;
    attemptCompress(parent);
  };

  const handleTabChange = (nextTab: 'overview' | 'notes' | 'pace' | 'heatmap') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', nextTab);
      return next;
    });
  };

  useEffect(() => {
    if (!project.data) return;
    const normalizedNotesDraft = notesDraft.trim().length > 0 ? notesDraft : null;
    const notesChanged = normalizedNotesDraft !== project.data.notes;
    if (!notesChanged || updateProject.isPending) return;

    const timeoutId = window.setTimeout(() => {
      void updateProject
        .mutateAsync({
          id: project.data!.id,
          patch: { notes: notesDraft },
        })
        .then(() => {
          setNotesError(null);
        })
        .catch((error) => {
          setNotesError(error instanceof Error ? error.message : 'Failed to save notes.');
        });
    }, NOTES_AUTOSAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notesDraft, project.data, updateProject]);

  if (!id) return <Navigate to="/projects" replace />;
  const isParentWithSubprojectsLoading =
    project.data &&
    isParentProject(project.data) &&
    subprojectsQuery.isLoading;
  if (
    project.isLoading ||
    tasks.isLoading ||
    isParentWithSubprojectsLoading ||
    (subprojectIds.length > 0 && subprojectTasksQuery.isLoading)
  ) {
    return <p className="text-muted">Loading…</p>;
  }
  if (!project.data) {
    return (
      <div className="space-y-3">
        <p className="text-muted">Project not found.</p>
        <Link to="/projects" className="btn-secondary">
          Back to projects
        </Link>
      </div>
    );
  }

  const p = project.data;
  const isParentWithSubprojects =
    isParentProject(p) && subprojects.length > 0;
  const { tag: displayTag, series: displaySeries } = resolvedProjectTagSeries(
    p,
    parentProject.data,
  );
  const displayProject = bufferVisibility
    ? { ...p, buffer_modifier: 1 }
    : p;
  let totalLen = 0;
  let progress = 0;
  let remaining = 0;
  if (isParentWithSubprojects) {
    for (const subproject of subprojects) {
      const subTasks = subprojectTasksById.get(subproject.id) ?? [];
      totalLen += totalTaskLength(subTasks, subproject);
      progress += projectProgress(subTasks, subproject);
      remaining += remainingProgress(subTasks, subproject);
    }
  } else {
    totalLen = totalTaskLength(allTasks, displayProject);
    progress = projectProgress(allTasks, displayProject);
    remaining = remainingProgress(allTasks, displayProject);
  }
  const overallPct = totalLen > 0 ? Math.min(100, (progress / totalLen) * 100) : 0;
  const bufferGoal = bufferModifierGoal(allTasks, p);
  const startLabel = formatDueDateTime(p.start_date);
  const dueLabel = formatDueDateTime(p.due_date);
  const archivedLabel = formatDueDateTime(p.archived_at);
  const normalizedNotesDraft = notesDraft.trim().length > 0 ? notesDraft : null;
  const notesChanged = normalizedNotesDraft !== p.notes;
  const notesStatusText = notesError
    ? 'Save failed'
    : updateProject.isPending && notesChanged
      ? 'Saving…'
      : notesChanged
        ? 'Unsaved changes'
        : 'Saved automatically';

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Link
            to={p.parent_id ? `/projects/${p.parent_id}` : '/projects'}
            className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
          >
            <span aria-hidden>←</span>{' '}
            {p.parent_id ? (parentProject.data?.name ?? 'Parent project') : 'Projects'}
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">
            {p.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="pill">video {formatHMS(p.video_length)}</span>
            <span className="pill">×{p.buffer_modifier} buffer</span>
            {startLabel ? <span className="pill">start {startLabel}</span> : null}
            {dueLabel ? <span className="pill">due {dueLabel}</span> : null}
            {displayTag ? (
              <TagPill name={displayTag} color={tagColorByName.get(displayTag)} />
            ) : null}
            {displaySeries ? (
              <TagPill name={displaySeries} color={seriesColorByName.get(displaySeries)} />
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditingProject((v) => !v)}
            className="btn-ghost"
          >
            {editingProject ? 'Close' : 'Edit'}
          </button>
          <button
            type="button"
            onClick={() => {
              setTemplateName('');
              setTemplateError(null);
              setShowTemplateForm((v) => !v);
            }}
            className="btn-ghost"
          >
            {showTemplateForm ? 'Close template form' : 'Save as template'}
          </button>
          <button
            type="button"
            onClick={() => setShowRebalanceModal(true)}
            className="btn-ghost"
          >
            Rebalance
          </button>
          {p.archived_at ? (
            <button
              type="button"
              onClick={async () => {
                await restoreProject.mutateAsync(p.id);
              }}
              className="btn-ghost"
            >
              {restoreProject.isPending ? 'Restoring…' : 'Restore'}
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => {
                if (!confirm('Archive this project?')) return;
                await archiveProject.mutateAsync(p.id);
                navigate('/projects/archive');
              }}
              className="btn-ghost"
            >
              {archiveProject.isPending ? 'Archiving…' : 'Archive'}
            </button>
          )}
          <button
            onClick={async () => {
              if (!confirm('Delete this project and all its tasks?')) return;
              await deleteProject.mutateAsync(p.id);
              navigate('/projects');
            }}
            className="btn-danger"
          >
            Delete
          </button>
          <Link to={`/projects/${p.id}/timer`} className="btn-primary">
            <PlayGlyph /> Start session
          </Link>
        </div>
      </div>

      {p.archived_at ? (
        <div className="card border-success/35 bg-success/10 text-sm text-fg">
          Archived{archivedLabel ? ` on ${archivedLabel}` : ''}. Restore to make this project active
          again.
        </div>
      ) : null}

      {showTemplateForm ? (
        <div className="card animate-fade-in space-y-3">
          <h2 className="text-lg font-semibold text-fg">Save as template</h2>
          <p className="text-sm text-muted">
            This captures your project settings and task blueprint for future projects.
            {isParentProject(p) && subprojects.length > 0
              ? ` Saves this project and ${subprojects.length} subproject${
                  subprojects.length === 1 ? '' : 's'
                } as a reusable template.`
              : null}
          </p>
          <div className="space-y-1">
            <label className="label" htmlFor="template-name">
              Template name
            </label>
            <input
              id="template-name"
              className="input"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="My repeatable workflow"
            />
          </div>
          {templateError ? <p className="text-xs text-danger">{templateError}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowTemplateForm(false);
                setTemplateError(null);
              }}
              className="btn-ghost"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={createTemplate.isPending}
              onClick={async () => {
                if (!templateName.trim()) {
                  setTemplateError('Template name is required.');
                  return;
                }
                try {
                  const subprojectPayload =
                    isParentProject(p) && subprojects.length > 0
                      ? subprojects.map((subproject) => ({
                          project: subproject,
                          tasks: subprojectTasksById.get(subproject.id) ?? [],
                        }))
                      : undefined;
                  const template = await createTemplate.mutateAsync({
                    name: templateName.trim(),
                    project: p,
                    tasks: allTasks,
                    subprojects: subprojectPayload,
                  });
                  setShowTemplateForm(false);
                  setTemplateError(null);
                  navigate(`/templates/${template.id}`);
                } catch (err) {
                  setTemplateError(
                    err instanceof Error ? err.message : 'Failed to save template.',
                  );
                }
              }}
              className="btn-primary"
            >
              {createTemplate.isPending ? 'Saving…' : 'Save template'}
            </button>
          </div>
        </div>
      ) : null}

      {editingProject ? (
        <div className="card animate-fade-in">
          <h2 className="mb-4 text-lg font-semibold text-fg">Edit project</h2>
          <ProjectForm
            initial={p}
            tagItems={projectTags.data ?? []}
            seriesItems={projectSeries.data ?? []}
            tagSeriesParent={p.parent_id ? parentProject.data : null}
            tagColorByName={tagColorByName}
            seriesColorByName={seriesColorByName}
            submitLabel="Save"
            onCancel={() => setEditingProject(false)}
            onSubmit={async (input) => {
              await updateProject.mutateAsync({ id: p.id, patch: input });
              setEditingProject(false);
            }}
          />
        </div>
      ) : null}

      <div className="segmented">
        <button
          data-active={activeTab === 'overview'}
          onClick={() => handleTabChange('overview')}
        >
          Overview
        </button>
        <button
          data-active={activeTab === 'notes'}
          onClick={() => handleTabChange('notes')}
        >
          Notes
        </button>
        <button
          data-active={activeTab === 'pace'}
          onClick={() => handleTabChange('pace')}
        >
          Pace
        </button>
        <button
          data-active={activeTab === 'heatmap'}
          onClick={() => handleTabChange('heatmap')}
        >
          Activity
        </button>
      </div>

      {activeTab === 'overview' ? (
        <>
          <div className="card space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-fg">Project totals</h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBufferVisibility((v) => !v)}
                  aria-pressed={bufferVisibility}
                  className={`btn-ghost text-xs ${
                    bufferVisibility
                      ? 'bg-accent/10 text-accent ring-1 ring-inset ring-accent/40'
                      : ''
                  }`}
                >
                  Buffer visibility
                </button>
                <span className="text-[11px] uppercase tracking-wider text-subtle">
                  {bufferVisibility
                    ? 'realtime (×1.00)'
                    : 'computed at read time'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="Total task length" value={formatHMS(totalLen)} mono />
              <Stat label="Progress" value={formatHMS(progress)} mono />
              <Stat label="Remaining" value={formatHMS(remaining)} mono />
              <Stat
                label="Buffer Modifier Goal"
                value={bufferGoal != null ? `×${bufferGoal.toFixed(2)}` : '—'}
                mono
              />
            </div>
            <div className="space-y-1.5">
              <div className="progress-track">
                <div
                  className="progress-fill progress-fill-success"
                  style={{ width: `${overallPct}%` }}
                  aria-hidden
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-subtle">
                <span className="font-sans tabular-nums">
                  {overallPct.toFixed(1)}%
                </span>
                <span>complete</span>
              </div>
            </div>
          </div>

          {isParentProject(p) ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-fg">Subprojects</h2>
                <button
                  type="button"
                  onClick={() => {
                    setSubprojectError(null);
                    setShowNewSubproject((value) => !value);
                  }}
                  className="btn-primary"
                >
                  {showNewSubproject ? 'Close' : 'Add subproject'}
                </button>
              </div>

              {showNewSubproject ? (
                <div className="card animate-fade-in">
                  <h3 className="mb-3 text-sm font-semibold text-fg">Create subproject</h3>
                  <ProjectForm
                    tagItems={projectTags.data ?? []}
                    seriesItems={projectSeries.data ?? []}
                    tagSeriesParent={p}
                    tagColorByName={tagColorByName}
                    seriesColorByName={seriesColorByName}
                    submitLabel="Create"
                    onCancel={() => setShowNewSubproject(false)}
                    onSubmit={async (input) => {
                      try {
                        await createSubproject.mutateAsync({
                          ...input,
                          parent_id: p.id,
                        });
                        setShowNewSubproject(false);
                        setSubprojectError(null);
                      } catch (err) {
                        setSubprojectError(
                          err instanceof Error
                            ? err.message
                            : 'Failed to create subproject.',
                        );
                      }
                    }}
                  />
                  {subprojectError ? (
                    <p className="mt-2 text-xs text-danger">{subprojectError}</p>
                  ) : null}
                </div>
              ) : null}

              {subprojectsQuery.isLoading ? (
                <p className="text-sm text-muted">Loading subprojects…</p>
              ) : subprojects.length === 0 ? (
                <p className="text-sm text-muted">
                  No subprojects yet. Add subprojects to track pace and tasks separately.
                </p>
              ) : (
                <ul className="space-y-2">
                  {subprojects.map((subproject) => {
                    const subTasks = subprojectTasksById.get(subproject.id) ?? [];
                    const subTotalLen = totalTaskLength(subTasks, subproject);
                    const subProgress = projectProgress(subTasks, subproject);
                    const subPct =
                      subTotalLen > 0
                        ? Math.min(100, (subProgress / subTotalLen) * 100)
                        : 0;
                    const isSubprojectArchived = !!subproject.archived_at;
                    return (
                      <li
                        key={subproject.id}
                        className={`card flex flex-wrap items-center gap-3 ${
                          isSubprojectArchived ? 'border-success/35 bg-success/15' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to={`/projects/${subproject.id}`}
                              className={`font-medium transition-colors ${
                                isSubprojectArchived
                                  ? 'text-success hover:text-success'
                                  : 'text-fg hover:text-accent'
                              }`}
                            >
                              {subproject.name}
                            </Link>
                            {isSubprojectArchived ? (
                              <span className="inline-flex rounded bg-success/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
                                Archived
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted">
                            {formatDueDateTime(subproject.due_date) ?? 'No due date'} ·{' '}
                            {subPct.toFixed(1)}% complete
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isSubprojectArchived ? (
                            <button
                              type="button"
                              className="btn-ghost text-xs"
                              onClick={async () => {
                                await restoreProject.mutateAsync(subproject.id);
                              }}
                            >
                              Restore
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-ghost text-xs"
                              onClick={async () => {
                                if (!confirm(`Archive "${subproject.name}"?`)) return;
                                await archiveProject.mutateAsync(subproject.id);
                              }}
                            >
                              Archive
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-danger text-xs"
                            onClick={async () => {
                              if (
                                !confirm(
                                  `Delete "${subproject.name}" and all its tasks?`,
                                )
                              ) {
                                return;
                              }
                              await deleteProject.mutateAsync(subproject.id);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-fg">Tasks</h2>
              {!isParentWithSubprojects ? (
                <button
                  onClick={() => setShowNewTask((v) => !v)}
                  className="btn-primary"
                >
                  {showNewTask ? 'Close' : 'New task'}
                </button>
              ) : null}
            </div>

            {isParentWithSubprojects ? (
              <p className="text-xs text-muted">
                Tasks live on subprojects. Add or reorder them from each subproject page.
              </p>
            ) : null}

            {!isParentWithSubprojects && showNewTask ? (
              <div className="card animate-fade-in">
                <h3 className="mb-3 text-sm font-semibold text-fg">Create task</h3>
                <TaskForm
                  projectId={p.id}
                  onCancel={() => setShowNewTask(false)}
                  submitLabel="Create"
                  onSubmit={async (input) => {
                    await createTask.mutateAsync({
                      ...input,
                      status: deriveTaskStatus(input, p),
                    });
                    setShowNewTask(false);
                  }}
                />
              </div>
            ) : null}

            {editingTask ? (
              <div className="card animate-fade-in">
                <h3 className="mb-3 text-sm font-semibold text-fg">Edit task</h3>
                <TaskForm
                  projectId={(editingTaskProject ?? p).id}
                  initial={editingTask}
                  onCancel={() => {
                    setEditingTask(null);
                    setEditingTaskProject(null);
                  }}
                  onDelete={async () => {
                    if (!confirm(`Delete "${editingTask.name}"?`)) return;
                    await deleteTask.mutateAsync(editingTask.id);
                    setEditingTask(null);
                    setEditingTaskProject(null);
                  }}
                  onMakeComplex={() => {
                    setComplexSettingsFor({
                      parent: editingTask,
                      mode: 'convert',
                    });
                    setEditingTask(null);
                    setEditingTaskProject(null);
                  }}
                  onEditSubtasks={() => {
                    setComplexSettingsFor({
                      parent: editingTask,
                      mode: 'edit',
                    });
                    setEditingTask(null);
                    setEditingTaskProject(null);
                  }}
                  submitLabel="Save"
                  onSubmit={async (input) => {
                    const taskProject = editingTaskProject ?? p;
                    const taskScope =
                      editingTaskProject != null
                        ? (subprojectTasksById.get(editingTaskProject.id) ?? [])
                        : allTasks;
                    const saveTask = editingTaskProject
                      ? updateAnySubprojectTask
                      : updateTask;
                    await saveTask.mutateAsync({
                      id: editingTask.id,
                      patch: {
                        ...input,
                        status: deriveTaskStatus(input, taskProject, taskScope),
                      },
                    });
                    setEditingTask(null);
                    setEditingTaskProject(null);
                  }}
                />
              </div>
            ) : null}

            {isParentWithSubprojects ? (
              subprojects.every(
                (subproject) => (subprojectTasksById.get(subproject.id) ?? []).length === 0,
              ) ? (
                <p className="text-sm text-muted">
                  No tasks yet across subprojects.
                </p>
              ) : (
                <div className="space-y-6">
                  {subprojects.map((subproject) => {
                    const subTasks = subprojectTasksById.get(subproject.id) ?? [];
                    if (subTasks.length === 0) return null;
                    const subTopLevel = topLevelTasksOf(subTasks);
                    const subSubtasksByParent = subtasksByParentOf(subTasks);
                    const isSubprojectArchived = !!subproject.archived_at;
                    return (
                      <div key={subproject.id} className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/projects/${subproject.id}`}
                            className={`text-sm font-semibold transition-colors ${
                              isSubprojectArchived
                                ? 'text-success hover:text-success'
                                : 'text-fg hover:text-accent'
                            }`}
                          >
                            {subproject.name}
                          </Link>
                          {isSubprojectArchived ? (
                            <span className="inline-flex rounded bg-success/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
                              Archived
                            </span>
                          ) : null}
                        </div>
                        <div className="space-y-2">
                          {subTopLevel.map((task) => {
                            const isExpandedParent = task.complex_mode === 'expanded';
                            const subs = subSubtasksByParent.get(task.id) ?? [];
                            return (
                              <div key={task.id} className="space-y-2">
                                <TaskRow
                                  task={task}
                                  project={subproject}
                                  allTasks={subTasks}
                                  onUpdateProgress={
                                    isExpandedParent
                                      ? undefined
                                      : async (taskId, nextProgress) => {
                                          const updatedTask = {
                                            ...task,
                                            current_progress: nextProgress,
                                          };
                                          await updateAnySubprojectTask.mutateAsync({
                                            id: taskId,
                                            patch: {
                                              current_progress: nextProgress,
                                              status: deriveTaskStatus(
                                                updatedTask,
                                                subproject,
                                                subTasks,
                                              ),
                                            },
                                          });
                                        }
                                  }
                                  progressInputDisabled={updateAnySubprojectTask.isPending}
                                  onEdit={() => {
                                    setEditingTask(task);
                                    setEditingTaskProject(subproject);
                                  }}
                                  onDone={
                                    isExpandedParent
                                      ? undefined
                                      : async () => {
                                          const nextProgress = progressTarget(task, subproject);
                                          await updateAnySubprojectTask.mutateAsync({
                                            id: task.id,
                                            patch: {
                                              current_progress: nextProgress,
                                              status: deriveTaskStatus(
                                                {
                                                  ...task,
                                                  current_progress: nextProgress,
                                                },
                                                subproject,
                                                subTasks,
                                              ),
                                            },
                                          });
                                        }
                                  }
                                />
                                {isExpandedParent
                                  ? subs.map((sub) => (
                                      <TaskRow
                                        key={sub.id}
                                        task={sub}
                                        project={subproject}
                                        allTasks={subTasks}
                                        isSubtask
                                        onUpdateProgress={async (taskId, nextProgress) => {
                                          const updatedTask = {
                                            ...sub,
                                            current_progress: nextProgress,
                                          };
                                          await updateAnySubprojectTask.mutateAsync({
                                            id: taskId,
                                            patch: {
                                              current_progress: nextProgress,
                                              status: deriveTaskStatus(
                                                updatedTask,
                                                subproject,
                                                subTasks,
                                              ),
                                            },
                                          });
                                        }}
                                        progressInputDisabled={updateAnySubprojectTask.isPending}
                                        onEdit={() => {
                                          setEditingTask(sub);
                                          setEditingTaskProject(subproject);
                                        }}
                                        onDone={async () => {
                                          const nextProgress = progressTarget(sub, subproject);
                                          await updateAnySubprojectTask.mutateAsync({
                                            id: sub.id,
                                            patch: {
                                              current_progress: nextProgress,
                                              status: deriveTaskStatus(
                                                {
                                                  ...sub,
                                                  current_progress: nextProgress,
                                                },
                                                subproject,
                                                subTasks,
                                              ),
                                            },
                                          });
                                        }}
                                      />
                                    ))
                                  : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : allTasks.length === 0 ? (
              <p className="text-sm text-muted">
                No tasks yet. Add tasks of any of the four types.
              </p>
            ) : (
              <>
                {topLevelTasks.length > 1 ? (
                  <p className="text-xs text-muted">
                    Drag tasks to reorder them.
                  </p>
                ) : null}
                {reorderError ? (
                  <p className="text-xs text-danger">{reorderError}</p>
                ) : null}
                <div className="space-y-2">
                  {topLevelTasks.map((t) => {
                    const isExpandedParent = t.complex_mode === 'expanded';
                    const isCompressedParent = t.complex_mode === 'compressed';
                    const isComplexParent = isExpandedParent || isCompressedParent;
                    const subs = subtasksByParent.get(t.id) ?? [];

                    return (
                      <div key={t.id} className="space-y-2">
                        <div
                          draggable
                          onDragStart={(event) => {
                            setDraggingTaskId(t.id);
                            event.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            handleDropOnTopLevel(t.id);
                          }}
                          onDragEnd={() => setDraggingTaskId(null)}
                          className={`rounded-xl ${
                            draggingTaskId === t.id ? 'opacity-60' : ''
                          }`}
                        >
                          <TaskRow
                            task={t}
                            project={displayProject}
                            allTasks={allTasks}
                            onUpdateProgress={
                              isExpandedParent
                                ? undefined
                                : async (taskId, nextProgress) => {
                                    const updatedTask = {
                                      ...t,
                                      current_progress: nextProgress,
                                    };
                                    await updateTask.mutateAsync({
                                      id: taskId,
                                      patch: {
                                        current_progress: nextProgress,
                                        status: deriveTaskStatus(
                                          updatedTask,
                                          p,
                                          allTasks,
                                        ),
                                      },
                                    });
                                  }
                            }
                            progressInputDisabled={updateTask.isPending}
                            onEdit={() => {
                              setEditingTask(t);
                              setEditingTaskProject(null);
                            }}
                            onDone={
                              isExpandedParent
                                ? undefined
                                : async () => {
                                    const nextProgress = progressTarget(t, p);
                                    await updateTask.mutateAsync({
                                      id: t.id,
                                      patch: {
                                        current_progress: nextProgress,
                                        status: deriveTaskStatus(
                                          { ...t, current_progress: nextProgress },
                                          p,
                                          allTasks,
                                        ),
                                      },
                                    });
                                  }
                            }
                            onOpenComplexSettings={
                              isComplexParent
                                ? () =>
                                    setComplexSettingsFor({
                                      parent: t,
                                      mode: 'edit',
                                    })
                                : undefined
                            }
                            onToggleComplexMode={
                              isComplexParent
                                ? (next) => handleToggleMode(t, next)
                                : undefined
                            }
                          />
                        </div>

                        {isExpandedParent
                          ? subs.map((sub) => (
                              <div
                                key={sub.id}
                                draggable
                                onDragStart={(event) => {
                                  setDraggingTaskId(sub.id);
                                  event.dataTransfer.effectAllowed = 'move';
                                }}
                                onDragOver={(event) => {
                                  event.preventDefault();
                                  event.dataTransfer.dropEffect = 'move';
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  handleDropOnSubtask(sub.id);
                                }}
                                onDragEnd={() => setDraggingTaskId(null)}
                                className={`rounded-xl ${
                                  draggingTaskId === sub.id ? 'opacity-60' : ''
                                }`}
                              >
                                <TaskRow
                                  task={sub}
                                  project={displayProject}
                                  allTasks={allTasks}
                                  isSubtask
                                  onUpdateProgress={async (taskId, nextProgress) => {
                                    const updatedTask = {
                                      ...sub,
                                      current_progress: nextProgress,
                                    };
                                    await updateTask.mutateAsync({
                                      id: taskId,
                                      patch: {
                                        current_progress: nextProgress,
                                        status: deriveTaskStatus(
                                          updatedTask,
                                          p,
                                          allTasks,
                                        ),
                                      },
                                    });
                                  }}
                                  progressInputDisabled={updateTask.isPending}
                                  onEdit={() => {
                                    setEditingTask(sub);
                                    setEditingTaskProject(null);
                                  }}
                                  onDone={async () => {
                                    const nextProgress = progressTarget(sub, p);
                                    await updateTask.mutateAsync({
                                      id: sub.id,
                                      patch: {
                                        current_progress: nextProgress,
                                        status: deriveTaskStatus(
                                          {
                                            ...sub,
                                            current_progress: nextProgress,
                                          },
                                          p,
                                          allTasks,
                                        ),
                                      },
                                    });
                                  }}
                                  onCompressFromSubtask={() =>
                                    handleCompressFromSubtask(sub)
                                  }
                                />
                              </div>
                            ))
                          : null}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      ) : activeTab === 'notes' ? (
        <div className="card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-fg">Markdown notes</h2>
            <span className="text-xs text-muted">{notesStatusText}</span>
          </div>
          <textarea
            className="input min-h-72 resize-y"
            value={notesDraft}
            onChange={(event) => {
              setNotesDraft(event.target.value);
              if (notesError) setNotesError(null);
            }}
            placeholder="Write notes in markdown..."
            spellCheck
          />
          <p className="text-xs text-muted">Changes save automatically.</p>
          {notesError ? <p className="text-xs text-danger">{notesError}</p> : null}
        </div>
      ) : activeTab === 'heatmap' ? (
        <div className="space-y-4">
          <div className="segmented w-fit">
            <button
              type="button"
              data-active={projectHeatmapSubTab === 'heatmap'}
              onClick={() => setProjectHeatmapSubTab('heatmap')}
            >
              Heatmap
            </button>
            <button
              type="button"
              data-active={projectHeatmapSubTab === 'logs'}
              onClick={() => setProjectHeatmapSubTab('logs')}
            >
              Logs
            </button>
          </div>
          {projectHeatmapSubTab === 'heatmap' ? (
            <div className="card">
              {projectHeatmapLogsQuery.isLoading ? (
                <p className="text-muted">Loading heatmap…</p>
              ) : projectHeatmapLogsQuery.error ? (
                <p className="text-danger">{projectHeatmapLogsQuery.error.message}</p>
              ) : (
                <HeatmapGrid
                  logs={projectHeatmapLogsQuery.data ?? []}
                  weeks={PROJECT_HEATMAP_WEEKS}
                  compact
                />
              )}
            </div>
          ) : (
            <div className="card">
              <RealtimeLogsTab
                logs={projectLogsQuery.data ?? []}
                projectId={p.id}
                isLoading={projectLogsQuery.isLoading}
                error={projectLogsQuery.error}
                limit={projectLogsLimit}
                onLimitChange={setProjectLogsLimit}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <PaceDisplay
            project={p}
            tasks={allTasks}
            pace={pace.data ?? null}
            section="headline"
          />
          <PaceSettingsForm project={p} tasks={allTasks} pace={pace.data ?? null} />
          <PaceDisplay
            project={p}
            tasks={allTasks}
            pace={pace.data ?? null}
            section="details"
          />
        </div>
      )}
      <RebalanceModal
        open={showRebalanceModal}
        project={p}
        tasks={allTasks}
        pace={pace.data ?? null}
        onClose={() => setShowRebalanceModal(false)}
      />
      <ComplexTaskSettingsModal
        open={!!complexSettingsFor}
        parent={complexSettingsFor?.parent ?? null}
        project={p}
        existingSubtasks={
          complexSettingsFor
            ? getSubtasks(complexSettingsFor.parent.id, allTasks)
            : []
        }
        mode={complexSettingsFor?.mode ?? 'edit'}
        onClose={() => setComplexSettingsFor(null)}
        onSave={async (drafts) => {
          if (!complexSettingsFor) return;
          const { parent, mode } = complexSettingsFor;
          if (mode === 'convert') {
            await convertToComplex.mutateAsync({ parent, subtasks: drafts });
          } else {
            await saveComplexSettings.mutateAsync({ parent, subtasks: drafts });
          }
        }}
      />
      <ComplexCollapseConflictModal
        open={!!collapseConflictFor}
        parent={collapseConflictFor}
        subtasks={
          collapseConflictFor
            ? getSubtasks(collapseConflictFor.id, allTasks)
            : []
        }
        onCancel={() => setCollapseConflictFor(null)}
        onConfirm={async (chosen) => {
          if (!collapseConflictFor) return;
          await toggleComplexMode.mutateAsync({
            parentId: collapseConflictFor.id,
            mode: 'compressed',
            chosenProgress: chosen,
          });
          setCollapseConflictFor(null);
        }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="label">{label}</div>
      <div
        className={`mt-1 text-lg text-fg ${mono ? 'font-sans tabular-nums' : ''}`}
      >
        {value}
      </div>
    </div>
  );
}

function PlayGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 5.5v13a1 1 0 0 0 1.55.83l10-6.5a1 1 0 0 0 0-1.66l-10-6.5A1 1 0 0 0 8 5.5z" />
    </svg>
  );
}
