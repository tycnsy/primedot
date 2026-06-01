import { useEffect, useState } from 'react';
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  useArchiveProject,
  useDeleteProject,
  useProject,
  useProjectSeries,
  useProjectTags,
  useRestoreProject,
  useUpdateProject,
} from '../hooks/useProjects';
import {
  useConvertToComplex,
  useCreateTask,
  useDeleteTask,
  useReorderTasks,
  useSaveComplexSettings,
  useTasks,
  useToggleComplexMode,
  useUpdateTask,
} from '../hooks/useTasks';
import { usePaceSettings } from '../hooks/usePaceSettings';
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
import { formatHMS } from '../lib/time';
import type { ComplexMode, Task } from '../lib/types';

const NOTES_AUTOSAVE_DELAY_MS = 700;
const EMPTY_TASKS: Task[] = [];

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

export default function ProjectDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const navigate = useNavigate();
  const project = useProject(id);
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
  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'pace'>('overview');
  const [notesDraft, setNotesDraft] = useState('');
  const [notesError, setNotesError] = useState<string | null>(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
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

  useEffect(() => {
    const nextTab =
      requestedTab === 'pace' || requestedTab === 'notes' ? requestedTab : 'overview';
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

  const handleTabChange = (nextTab: 'overview' | 'notes' | 'pace') => {
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
  if (project.isLoading || tasks.isLoading) {
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
  const totalLen = totalTaskLength(allTasks, p);
  const progress = projectProgress(allTasks, p);
  const remaining = remainingProgress(allTasks, p);
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
            to="/projects"
            className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
          >
            <span aria-hidden>←</span> Projects
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">
            {p.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="pill">video {formatHMS(p.video_length)}</span>
            <span className="pill">×{p.buffer_modifier} buffer</span>
            {startLabel ? <span className="pill">start {startLabel}</span> : null}
            {dueLabel ? <span className="pill">due {dueLabel}</span> : null}
            {p.tag ? <TagPill name={p.tag} color={tagColorByName.get(p.tag)} /> : null}
            {p.series ? (
              <TagPill name={p.series} color={seriesColorByName.get(p.series)} />
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
                  await createTemplate.mutateAsync({
                    name: templateName.trim(),
                    project: p,
                    tasks: allTasks,
                  });
                  setShowTemplateForm(false);
                  setTemplateError(null);
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
      </div>

      {activeTab === 'overview' ? (
        <>
          <div className="card space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-fg">Project totals</h2>
              <span className="text-[11px] uppercase tracking-wider text-subtle">
                computed at read time
              </span>
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

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-fg">Tasks</h2>
              <button
                onClick={() => setShowNewTask((v) => !v)}
                className="btn-primary"
              >
                {showNewTask ? 'Close' : 'New task'}
              </button>
            </div>

            {showNewTask ? (
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
                  projectId={p.id}
                  initial={editingTask}
                  onCancel={() => setEditingTask(null)}
                  onDelete={async () => {
                    if (!confirm(`Delete "${editingTask.name}"?`)) return;
                    await deleteTask.mutateAsync(editingTask.id);
                    setEditingTask(null);
                  }}
                  onMakeComplex={() => {
                    setComplexSettingsFor({
                      parent: editingTask,
                      mode: 'convert',
                    });
                    setEditingTask(null);
                  }}
                  onEditSubtasks={() => {
                    setComplexSettingsFor({
                      parent: editingTask,
                      mode: 'edit',
                    });
                    setEditingTask(null);
                  }}
                  submitLabel="Save"
                  onSubmit={async (input) => {
                    await updateTask.mutateAsync({
                      id: editingTask.id,
                      patch: {
                        ...input,
                        status: deriveTaskStatus(input, p, allTasks),
                      },
                    });
                    setEditingTask(null);
                  }}
                />
              </div>
            ) : null}

            {allTasks.length === 0 ? (
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
                            project={p}
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
                            onEdit={() => setEditingTask(t)}
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
                                  project={p}
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
                                  onEdit={() => setEditingTask(sub)}
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
