import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  useDeleteProject,
  useProject,
  useProjectTags,
  useUpdateProject,
} from '../hooks/useProjects';
import {
  useCreateTask,
  useDeleteTask,
  useReorderTasks,
  useTasks,
  useUpdateTask,
} from '../hooks/useTasks';
import { usePaceSettings } from '../hooks/usePaceSettings';
import { useCreateTemplateFromProject } from '../hooks/useTemplates';
import ProjectForm from '../components/ProjectForm';
import TaskForm from '../components/TaskForm';
import TaskRow from '../components/TaskRow';
import PaceDisplay from '../components/PaceDisplay';
import PaceSettingsForm from '../components/PaceSettingsForm';
import {
  projectProgress,
  progressTarget,
  remainingProgress,
  totalTaskLength,
} from '../lib/calc';
import { formatHMS } from '../lib/time';
import type { Task } from '../lib/types';

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

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const project = useProject(id);
  const projectTags = useProjectTags();
  const tasks = useTasks(id);
  const pace = usePaceSettings(id);
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const createTask = useCreateTask(id ?? '');
  const updateTask = useUpdateTask(id ?? '');
  const deleteTask = useDeleteTask(id ?? '');
  const reorderTasksMutation = useReorderTasks(id ?? '');
  const createTemplate = useCreateTemplateFromProject();

  const [editingProject, setEditingProject] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'pace'>('overview');
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [orderedTasks, setOrderedTasks] = useState<Task[]>([]);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const allTasks = tasks.data ?? [];

  useEffect(() => {
    setOrderedTasks(allTasks);
  }, [allTasks]);

  const handleDropOnTask = (targetId: string) => {
    if (!draggingTaskId) return;
    const next = reorderTasks(orderedTasks, draggingTaskId, targetId);
    setDraggingTaskId(null);
    if (next === orderedTasks) return;
    setOrderedTasks(next);
    reorderTasksMutation.mutate(next.map((task) => task.id));
  };

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
            {p.due_date ? <span className="pill">due {p.due_date}</span> : null}
            {p.tag ? <span className="pill">{p.tag}</span> : null}
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
            tagOptions={(projectTags.data ?? []).map((tag) => tag.name)}
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
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          data-active={activeTab === 'pace'}
          onClick={() => setActiveTab('pace')}
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
                    await createTask.mutateAsync(input);
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
                  submitLabel="Save"
                  onSubmit={async (input) => {
                    await updateTask.mutateAsync({
                      id: editingTask.id,
                      patch: input,
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
                {orderedTasks.length > 1 ? (
                  <p className="text-xs text-muted">
                    Drag tasks to reorder them.
                  </p>
                ) : null}
                <div className="space-y-2">
                  {orderedTasks.map((t) => (
                    <div
                      key={t.id}
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
                        handleDropOnTask(t.id);
                      }}
                      onDragEnd={() => setDraggingTaskId(null)}
                      className={`rounded-xl ${
                        draggingTaskId === t.id ? 'opacity-60' : ''
                      }`}
                    >
                      <TaskRow
                        task={t}
                        project={p}
                        onUpdateProgress={async (taskId, nextProgress) => {
                          await updateTask.mutateAsync({
                            id: taskId,
                            patch: { current_progress: nextProgress },
                          });
                        }}
                        progressInputDisabled={updateTask.isPending}
                        onEdit={() => setEditingTask(t)}
                        onDone={async () => {
                          await updateTask.mutateAsync({
                            id: t.id,
                            patch: { current_progress: progressTarget(t, p) },
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
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
