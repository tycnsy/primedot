import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import TemplateTaskForm, {
  type TemplateTaskFormInput,
} from '../components/TemplateTaskForm';
import TagPill from '../components/TagPill';
import { useProjectSeries, useProjectTags } from '../hooks/useProjects';
import {
  useCreateTemplateTask,
  useDeleteTemplateTask,
  useReplaceTemplateTasksOrder,
  useTemplate,
  useTemplateTasks,
  useUpdateTemplate,
  useUpdateTemplateTask,
} from '../hooks/useTemplates';
import { formatHMS, parseHMS } from '../lib/time';
import { getSubtasks } from '../lib/calc';
import type { TemplateTask } from '../lib/types';

function move<T>(items: T[], from: number, to: number): T[] {
  if (from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

interface TemplateDraft {
  name: string;
  videoLengthHms: string;
  bufferModifier: string;
  tag: string;
  series: string;
}

function toTaskCreateInput(input: TemplateTaskFormInput, sortOrder: number) {
  return {
    ...input,
    sort_order: sortOrder,
    parent_id: null,
    complex_mode: null,
  };
}

function mergeTopLevelWithSubtasks(
  topLevel: TemplateTask[],
  subtasksByParent: Map<string, TemplateTask[]>,
): TemplateTask[] {
  const merged: TemplateTask[] = [];
  for (const top of topLevel) {
    merged.push(top);
    const subs = subtasksByParent.get(top.id);
    if (subs) merged.push(...subs);
  }
  return merged;
}

export default function TemplateDetail() {
  const { templateId } = useParams();
  const templateQ = useTemplate(templateId);
  const tasksQ = useTemplateTasks(templateId);
  const tagsQ = useProjectTags();
  const seriesQ = useProjectSeries();
  const updateTemplate = useUpdateTemplate();
  const createTask = useCreateTemplateTask(templateId ?? '');
  const updateTask = useUpdateTemplateTask(templateId ?? '');
  const deleteTask = useDeleteTemplateTask(templateId ?? '');
  const reorderTasks = useReplaceTemplateTasksOrder(templateId ?? '');

  const [editingTemplate, setEditingTemplate] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [editingTask, setEditingTask] = useState<TemplateTask | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [orderedTasks, setOrderedTasks] = useState<TemplateTask[]>([]);
  const [draft, setDraft] = useState<TemplateDraft>({
    name: '',
    videoLengthHms: '00:00:00',
    bufferModifier: '1',
    tag: '',
    series: '',
  });

  useEffect(() => {
    if (!templateQ.data) return;
    setDraft({
      name: templateQ.data.name,
      videoLengthHms: formatHMS(templateQ.data.video_length),
      bufferModifier: String(templateQ.data.buffer_modifier),
      tag: templateQ.data.tag ?? '',
      series: templateQ.data.series ?? '',
    });
  }, [templateQ.data]);

  useEffect(() => {
    setOrderedTasks(tasksQ.data ?? []);
  }, [tasksQ.data]);

  const topLevelTasks = useMemo(
    () => orderedTasks.filter((task) => !task.parent_id),
    [orderedTasks],
  );
  const subtasksByParent = useMemo(() => {
    const map = new Map<string, TemplateTask[]>();
    for (const task of orderedTasks) {
      if (!task.parent_id) continue;
      const subs = map.get(task.parent_id) ?? [];
      subs.push(task);
      map.set(task.parent_id, subs);
    }
    for (const subs of map.values()) {
      subs.sort((a, b) => a.sort_order - b.sort_order);
    }
    return map;
  }, [orderedTasks]);

  const tagColorByName = useMemo(
    () => new Map((tagsQ.data ?? []).map((tag) => [tag.name, tag.color] as const)),
    [tagsQ.data],
  );
  const seriesColorByName = useMemo(
    () =>
      new Map((seriesQ.data ?? []).map((series) => [series.name, series.color] as const)),
    [seriesQ.data],
  );

  const tagDatalistOptions = useMemo(() => {
    const names = (tagsQ.data ?? [])
      .filter((tag) => !tag.archived_at)
      .map((tag) => tag.name);
    if (draft.tag.trim() && !names.includes(draft.tag.trim())) {
      names.push(draft.tag.trim());
    }
    return names;
  }, [tagsQ.data, draft.tag]);

  const seriesDatalistOptions = useMemo(() => {
    const trimmedTag = draft.tag.trim();
    const names = (seriesQ.data ?? [])
      .filter((series) => {
        if (series.archived_at) return false;
        if (!trimmedTag) return true;
        return series.tag === trimmedTag;
      })
      .map((series) => series.name);
    if (draft.series.trim() && !names.includes(draft.series.trim())) {
      names.push(draft.series.trim());
    }
    return names;
  }, [seriesQ.data, draft.tag, draft.series]);

  const handleSeriesDraftChange = (value: string) => {
    setDraft((prev) => {
      if (prev.tag.trim()) return { ...prev, series: value };
      const match = (seriesQ.data ?? []).find((series) => series.name === value.trim());
      return match?.tag
        ? { ...prev, series: value, tag: match.tag }
        : { ...prev, series: value };
    });
  };

  if (!templateId) return <Navigate to="/templates" replace />;
  if (templateQ.isLoading || tasksQ.isLoading) return <p className="text-muted">Loading…</p>;
  if (!templateQ.data) {
    return (
      <div className="space-y-3">
        <p className="text-muted">Template not found.</p>
        <Link to="/templates" className="btn-secondary">
          Back to templates
        </Link>
      </div>
    );
  }

  const template = templateQ.data;

  const saveTemplate = async () => {
    setTemplateError(null);
    if (!draft.name.trim()) {
      setTemplateError('Template name is required.');
      return;
    }
    const videoLength = parseHMS(draft.videoLengthHms);
    if (videoLength == null) {
      setTemplateError('Video length must be hh:mm:ss.');
      return;
    }
    const bufferModifier = Number.parseFloat(draft.bufferModifier);
    if (!Number.isFinite(bufferModifier) || bufferModifier <= 0) {
      setTemplateError('Buffer modifier must be > 0.');
      return;
    }
    try {
      await updateTemplate.mutateAsync({
        id: template.id,
        patch: {
          name: draft.name.trim(),
          video_length: videoLength,
          buffer_modifier: bufferModifier,
          tag: draft.tag,
          series: draft.series,
        },
      });
      setEditingTemplate(false);
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : 'Failed to update template.');
    }
  };

  const handleCreateTask = async (input: TemplateTaskFormInput) => {
    setTaskError(null);
    try {
      await createTask.mutateAsync(toTaskCreateInput(input, orderedTasks.length));
      setShowNewTask(false);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : 'Failed to create task.');
    }
  };

  const handleUpdateTask = async (task: TemplateTask, input: TemplateTaskFormInput) => {
    setTaskError(null);
    try {
      await updateTask.mutateAsync({
        id: task.id,
        patch: input,
      });
      setEditingTask(null);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : 'Failed to update task.');
    }
  };

  const handleDeleteTask = async (task: TemplateTask) => {
    if (!confirm(`Delete "${task.name}"?`)) return;
    setTaskError(null);
    try {
      await deleteTask.mutateAsync(task.id);
      setEditingTask(null);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : 'Failed to delete task.');
    }
  };

  const handleMoveTopLevelTask = async (taskIndex: number, delta: -1 | 1) => {
    const nextIndex = taskIndex + delta;
    if (nextIndex < 0 || nextIndex >= topLevelTasks.length) return;
    const previous = orderedTasks;
    const reorderedTop = move(topLevelTasks, taskIndex, nextIndex);
    const merged = mergeTopLevelWithSubtasks(reorderedTop, subtasksByParent);
    const withSortOrder = merged.map((task, index) => ({ ...task, sort_order: index }));
    setOrderedTasks(withSortOrder);
    setReorderError(null);
    try {
      await reorderTasks.mutateAsync(merged.map((task) => task.id));
    } catch (error) {
      setOrderedTasks(previous);
      setReorderError(error instanceof Error ? error.message : 'Failed to reorder tasks.');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Link
            to="/templates"
            className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
          >
            <span aria-hidden>←</span> Templates
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">{template.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="pill">video {formatHMS(template.video_length)}</span>
            <span className="pill">×{template.buffer_modifier} buffer</span>
            {template.tag ? (
              <TagPill name={template.tag} color={tagColorByName.get(template.tag)} />
            ) : null}
            {template.series ? (
              <TagPill
                name={template.series}
                color={seriesColorByName.get(template.series)}
              />
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setTemplateError(null);
            setEditingTemplate((value) => !value);
          }}
          className="btn-ghost"
        >
          {editingTemplate ? 'Close' : 'Edit template'}
        </button>
      </div>

      {editingTemplate ? (
        <div className="card animate-fade-in space-y-4">
          <h2 className="text-lg font-semibold text-fg">Template settings</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label className="label">Name</label>
              <input
                className="input"
                value={draft.name}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <label className="label">Video length (hh:mm:ss)</label>
              <input
                className="input font-sans"
                value={draft.videoLengthHms}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, videoLengthHms: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <label className="label">Buffer modifier</label>
              <input
                type="number"
                min="0"
                step="0.1"
                className="input"
                value={draft.bufferModifier}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, bufferModifier: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <label className="label">Tag</label>
              <input
                className="input"
                list="template-tag-options"
                value={draft.tag}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, tag: event.target.value }))
                }
                placeholder="Optional"
              />
              <datalist id="template-tag-options">
                {tagDatalistOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1">
              <label className="label">Series</label>
              <input
                className="input"
                list="template-series-options"
                value={draft.series}
                onChange={(event) => handleSeriesDraftChange(event.target.value)}
                placeholder="Optional"
              />
              <datalist id="template-series-options">
                {seriesDatalistOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
          </div>
          {templateError ? <p className="text-xs text-danger">{templateError}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingTemplate(false);
                setTemplateError(null);
                setDraft({
                  name: template.name,
                  videoLengthHms: formatHMS(template.video_length),
                  bufferModifier: String(template.buffer_modifier),
                  tag: template.tag ?? '',
                  series: template.series ?? '',
                });
              }}
              className="btn-ghost"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                void saveTemplate();
              }}
              className="btn-primary"
              disabled={updateTemplate.isPending}
            >
              {updateTemplate.isPending ? 'Saving…' : 'Save template'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-fg">Tasks</h2>
          <button
            type="button"
            onClick={() => {
              setTaskError(null);
              setShowNewTask((value) => !value);
            }}
            className="btn-primary"
          >
            {showNewTask ? 'Close' : 'New task'}
          </button>
        </div>

        {showNewTask ? (
          <div className="card animate-fade-in">
            <h3 className="mb-3 text-sm font-semibold text-fg">Create task</h3>
            <TemplateTaskForm
              submitLabel="Create"
              onCancel={() => setShowNewTask(false)}
              onSubmit={handleCreateTask}
            />
          </div>
        ) : null}

        {editingTask ? (
          <div className="card animate-fade-in">
            <h3 className="mb-3 text-sm font-semibold text-fg">Edit task</h3>
            <TemplateTaskForm
              initial={editingTask}
              submitLabel="Save"
              onCancel={() => setEditingTask(null)}
              onDelete={() => handleDeleteTask(editingTask)}
              onSubmit={async (input) => handleUpdateTask(editingTask, input)}
            />
          </div>
        ) : null}

        {taskError ? <p className="text-xs text-danger">{taskError}</p> : null}
        {reorderError ? <p className="text-xs text-danger">{reorderError}</p> : null}

        {topLevelTasks.length === 0 ? (
          <p className="text-sm text-muted">
            No template tasks yet. Add tasks to shape this blueprint.
          </p>
        ) : (
          <ul className="space-y-2">
            {topLevelTasks.map((task, index) => {
              const isComplexParent =
                task.complex_mode === 'compressed' || task.complex_mode === 'expanded';
              const subs = getSubtasks(task.id, orderedTasks);

              return (
                <li key={task.id} className="space-y-2">
                  <TemplateTaskRow
                    task={task}
                    isComplexParent={isComplexParent}
                    showReorder
                    moveUpDisabled={index === 0 || reorderTasks.isPending}
                    moveDownDisabled={
                      index === topLevelTasks.length - 1 || reorderTasks.isPending
                    }
                    onMoveUp={() => {
                      void handleMoveTopLevelTask(index, -1);
                    }}
                    onMoveDown={() => {
                      void handleMoveTopLevelTask(index, 1);
                    }}
                    onEdit={() => setEditingTask(task)}
                  />
                  {subs.map((sub) => (
                    <TemplateTaskRow
                      key={sub.id}
                      task={sub}
                      isSubtask
                      onEdit={() => setEditingTask(sub)}
                    />
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function TemplateTaskRow({
  task,
  isComplexParent = false,
  isSubtask = false,
  showReorder = false,
  moveUpDisabled = false,
  moveDownDisabled = false,
  onMoveUp,
  onMoveDown,
  onEdit,
}: {
  task: TemplateTask;
  isComplexParent?: boolean;
  isSubtask?: boolean;
  showReorder?: boolean;
  moveUpDisabled?: boolean;
  moveDownDisabled?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      className={`card flex flex-wrap items-center justify-between gap-3 ${
        isSubtask ? 'ml-6 border-l-2 border-border' : ''
      }`}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="pill">{task.type}</span>
          {isComplexParent && task.complex_mode ? (
            <span className="pill">{task.complex_mode}</span>
          ) : null}
          {isSubtask ? <span className="text-xs text-muted">subtask</span> : null}
          <h3 className="text-sm font-medium text-fg">{task.name}</h3>
        </div>
        <TaskDetail task={task} />
      </div>
      <div className="flex items-center gap-2">
        {showReorder ? (
          <>
            <button
              type="button"
              className="btn-ghost !px-2"
              onClick={onMoveUp}
              disabled={moveUpDisabled}
              title="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              className="btn-ghost !px-2"
              onClick={onMoveDown}
              disabled={moveDownDisabled}
              title="Move down"
            >
              ↓
            </button>
          </>
        ) : null}
        <button type="button" onClick={onEdit} className="btn-ghost">
          Edit
        </button>
      </div>
    </div>
  );
}

function TaskDetail({ task }: { task: TemplateTask }) {
  if (task.type === 'scaling') {
    return (
      <p className="text-xs text-muted font-sans tabular-nums">
        Scaling modifier: {task.scaling_modifier ?? '-'}
      </p>
    );
  }
  if (task.type === 'scripting') {
    return (
      <p className="text-xs text-muted font-sans tabular-nums">
        Scripting modifier: {task.scripting_modifier ?? '-'} | Script length:{' '}
        {task.script_length != null ? formatHMS(task.script_length) : '-'}
      </p>
    );
  }
  if (task.type === 'custom') {
    return (
      <p className="text-xs text-muted font-sans tabular-nums">
        Unit count: {task.unit_count ?? '-'} | Unit length: {task.unit_length ?? '-'}s
      </p>
    );
  }
  return (
    <p className="text-xs text-muted font-sans tabular-nums">
      Manual length: {task.manual_length != null ? formatHMS(task.manual_length) : '-'}
    </p>
  );
}
