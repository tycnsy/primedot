import { useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  computeAllotment,
  remainingProgressUnits,
  type ChunkAllotmentMode,
  type ChunkPlannerChunk,
  type ChunkPlannerEntry,
} from '../lib/chunkPlanner';
import { formatCompactHoursMinutes, formatHMS, parseHMS } from '../lib/time';
import type { Task, TaskType } from '../lib/types';
import { useProjects } from '../hooks/useProjects';
import { useTasksForProjects } from '../hooks/useTasks';
import {
  useChunkPlanner,
} from '../hooks/useChunkPlanner';

function isTimecodeType(type: TaskType): boolean {
  return type === 'scaling' || type === 'scripting' || type === 'manual';
}

function formatProgressAmount(type: TaskType, amount: number): string {
  if (type === 'custom') {
    const rounded = Math.round(amount * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  }
  return formatHMS(Math.round(amount));
}

function formatRealtime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return formatCompactHoursMinutes(seconds);
}

function SortableEntryCard({
  entry,
  chunks,
  onRemove,
}: {
  entry: ChunkPlannerEntry;
  chunks: ChunkPlannerChunk[];
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`card space-y-3 ${isDragging ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 shrink-0 rounded p-1 text-subtle hover:bg-surface2 hover:text-fg"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium text-fg">{entry.taskName}</p>
              <p className="text-xs text-muted">{entry.projectName}</p>
            </div>
            <button
              type="button"
              className="btn-ghost shrink-0 px-2 py-1 text-xs text-danger"
              onClick={() => onRemove(entry.id)}
            >
              Remove
            </button>
          </div>
          <p className="text-sm text-muted">
            {formatProgressAmount(entry.taskType, entry.startProgress)}
            <span className="text-subtle"> → </span>
            {formatProgressAmount(
              entry.taskType,
              entry.startProgress + entry.allottedProgress,
            )}
            <span className="text-subtle"> · </span>
            {formatRealtime(entry.allottedRealtimeSeconds)}
            <span className="text-subtle"> · </span>
            {chunks.length} chunk{chunks.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {chunks.length > 0 ? (
        <ol className="space-y-1.5 border-t border-border pt-3">
          {chunks.map((chunk) => (
            <li
              key={chunk.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface2 px-3 py-2 text-sm"
            >
              <span className="font-medium text-fg">
                Chunk {chunk.index + 1}
                <span className="text-subtle"> · </span>
                {formatProgressAmount(entry.taskType, chunk.progressFrom)}
                <span className="text-subtle"> → </span>
                {formatProgressAmount(entry.taskType, chunk.progressTo)}
              </span>
              <span className="text-muted">{formatRealtime(chunk.realtimeSeconds)}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

export default function ChunkPlanner() {
  const projectsQ = useProjects();
  const projects = useMemo(() => projectsQ.data ?? [], [projectsQ.data]);
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);
  const tasksQ = useTasksForProjects(projectIds);
  const allTasks = tasksQ.data ?? [];

  const {
    entries,
    chunkLengthSeconds,
    setChunkLengthSeconds,
    addEntry,
    removeEntry,
    clearBoard,
    reorderEntries,
    chunksByEntryId,
    totalRealtimeSeconds,
    totalChunkCount,
  } = useChunkPlanner();

  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [mode, setMode] = useState<ChunkAllotmentMode>('progress');
  const [amountDraft, setAmountDraft] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [chunkMinutesDraft, setChunkMinutesDraft] = useState(
    String(Math.round(chunkLengthSeconds / 60)),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  );

  const projectTasks = useMemo(() => {
    if (!projectId) return [];
    return allTasks
      .filter(
        (t) =>
          t.project_id === projectId &&
          t.status !== 'complete' &&
          !(t.complex_mode === 'expanded' && !t.parent_id),
      )
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }, [allTasks, projectId]);

  const selectedTask: Task | null = useMemo(
    () => projectTasks.find((t) => t.id === taskId) ?? null,
    [projectTasks, taskId],
  );

  const preview = useMemo(() => {
    if (!selectedProject || !selectedTask) return null;
    const remaining = remainingProgressUnits(selectedTask, selectedProject);
    let amount = 0;
    if (mode === 'progress') {
      if (selectedTask.type === 'custom') {
        const n = Number.parseInt(amountDraft, 10);
        if (!Number.isFinite(n) || n < 0) return { remaining, allotment: null, parseError: amountDraft.trim() ? 'Whole non-negative number required.' : null };
        amount = n;
      } else {
        const sec = parseHMS(amountDraft);
        if (sec == null) {
          return {
            remaining,
            allotment: null,
            parseError: amountDraft.trim() ? 'Format hh:mm:ss.' : null,
          };
        }
        amount = sec;
      }
    } else {
      const mins = Number.parseFloat(amountDraft);
      if (!Number.isFinite(mins) || mins < 0) {
        return {
          remaining,
          allotment: null,
          parseError: amountDraft.trim() ? 'Enter minutes as a non-negative number.' : null,
        };
      }
      amount = mins * 60;
    }
    const allotment = computeAllotment(selectedTask, selectedProject, mode, amount);
    return { remaining, allotment, parseError: null as string | null };
  }, [selectedProject, selectedTask, mode, amountDraft]);

  const handleProjectChange = (nextId: string) => {
    setProjectId(nextId);
    setTaskId('');
    setAmountDraft('');
    setFormError(null);
  };

  const handleTaskChange = (nextId: string) => {
    setTaskId(nextId);
    setAmountDraft('');
    setFormError(null);
  };

  const handleModeChange = (next: ChunkAllotmentMode) => {
    setMode(next);
    setAmountDraft('');
    setFormError(null);
  };

  const handleAdd = () => {
    setFormError(null);
    if (!selectedProject || !selectedTask) {
      setFormError('Select a project and task.');
      return;
    }
    if (preview?.parseError) {
      setFormError(preview.parseError);
      return;
    }
    if (!preview?.allotment || preview.allotment.allottedProgress <= 0) {
      setFormError('Allot some remaining work greater than zero.');
      return;
    }

    let amount = 0;
    if (mode === 'progress') {
      if (selectedTask.type === 'custom') {
        amount = Number.parseInt(amountDraft, 10);
      } else {
        amount = parseHMS(amountDraft) ?? 0;
      }
    } else {
      amount = Number.parseFloat(amountDraft) * 60;
    }

    const created = addEntry({
      project: selectedProject,
      task: selectedTask,
      mode,
      amount,
    });
    if (!created) {
      setFormError('Nothing to add — check remaining work and rate.');
      return;
    }
    setAmountDraft('');
  };

  const handleChunkLengthBlur = () => {
    const mins = Number.parseFloat(chunkMinutesDraft);
    if (!Number.isFinite(mins) || mins < 1) {
      setChunkMinutesDraft(String(Math.round(chunkLengthSeconds / 60)));
      return;
    }
    const seconds = Math.round(mins * 60);
    setChunkLengthSeconds(seconds);
    setChunkMinutesDraft(String(Math.round(seconds / 60)));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = entries.map((e) => e.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    reorderEntries(arrayMove(ids, oldIndex, newIndex));
  };

  const amountLabel =
    mode === 'realtime'
      ? 'Realtime (minutes)'
      : selectedTask?.type === 'custom'
        ? 'Progress (units)'
        : 'Progress (hh:mm:ss)';

  const amountPlaceholder =
    mode === 'realtime'
      ? '15'
      : selectedTask?.type === 'custom'
        ? '10'
        : '00:10:00';

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <span className="label">Planning</span>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">Chunks</h1>
          <p className="max-w-lg text-sm text-muted">
            Allot remaining task work and break it into timed chunks. Local board only —
            nothing writes back to project progress.
          </p>
        </div>
        {entries.length > 0 ? (
          <button type="button" className="btn-ghost text-sm" onClick={clearBoard}>
            Clear board
          </button>
        ) : null}
      </div>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-fg">Add task</h2>
          <div className="segmented" role="group" aria-label="Allotment mode">
            <button
              type="button"
              data-active={mode === 'progress'}
              onClick={() => handleModeChange('progress')}
            >
              Progress
            </button>
            <button
              type="button"
              data-active={mode === 'realtime'}
              onClick={() => handleModeChange('realtime')}
            >
              Realtime
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="label">Project</span>
            <select
              className="input"
              value={projectId}
              onChange={(e) => handleProjectChange(e.target.value)}
              disabled={projectsQ.isLoading}
            >
              <option value="">Select project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="label">Task</span>
            <select
              className="input"
              value={taskId}
              onChange={(e) => handleTaskChange(e.target.value)}
              disabled={!projectId || tasksQ.isLoading}
            >
              <option value="">Select task…</option>
              {projectTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="space-y-1.5">
            <span className="label">{amountLabel}</span>
            <input
              className="input"
              value={amountDraft}
              onChange={(e) => {
                setAmountDraft(e.target.value);
                setFormError(null);
              }}
              placeholder={amountPlaceholder}
              disabled={!selectedTask}
              inputMode={
                mode === 'realtime' || selectedTask?.type === 'custom'
                  ? 'decimal'
                  : 'text'
              }
            />
          </label>
          <button
            type="button"
            className="btn-primary"
            onClick={handleAdd}
            disabled={!selectedTask}
          >
            Add to board
          </button>
        </div>

        {selectedTask && selectedProject && preview ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span>
              Remaining:{' '}
              <span className="text-fg">
                {formatProgressAmount(selectedTask.type, preview.remaining)}
              </span>
            </span>
            {preview.allotment && preview.allotment.allottedProgress > 0 ? (
              <>
                <span>
                  Allotting:{' '}
                  <span className="text-fg">
                    {formatProgressAmount(
                      selectedTask.type,
                      preview.allotment.allottedProgress,
                    )}
                  </span>
                </span>
                <span>
                  Realtime:{' '}
                  <span className="text-fg">
                    {formatRealtime(preview.allotment.allottedRealtimeSeconds)}
                  </span>
                </span>
              </>
            ) : null}
            {isTimecodeType(selectedTask.type) && mode === 'progress' ? (
              <span className="text-subtle">from current progress</span>
            ) : null}
          </div>
        ) : null}

        {(formError || preview?.parseError) && amountDraft.trim() ? (
          <p className="text-sm text-danger">{formError ?? preview?.parseError}</p>
        ) : formError ? (
          <p className="text-sm text-danger">{formError}</p>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-sm font-medium text-fg">Board</h2>
            {entries.length > 0 ? (
              <p className="text-sm text-muted">
                {entries.length} task{entries.length === 1 ? '' : 's'} · {totalChunkCount}{' '}
                chunk{totalChunkCount === 1 ? '' : 's'} · {formatRealtime(totalRealtimeSeconds)}{' '}
                total
              </p>
            ) : (
              <p className="text-sm text-muted">Add a task allotment to start planning.</p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="label mb-0">Chunk length (min)</span>
            <input
              className="input w-20"
              value={chunkMinutesDraft}
              onChange={(e) => setChunkMinutesDraft(e.target.value)}
              onBlur={handleChunkLengthBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              inputMode="decimal"
            />
          </label>
        </div>

        {entries.length === 0 ? (
          <div className="card py-10 text-center text-sm text-muted">
            No chunks yet. Pick a task and allot remaining work above.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={entries.map((e) => e.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-3">
                {entries.map((entry) => (
                  <SortableEntryCard
                    key={entry.id}
                    entry={entry}
                    chunks={chunksByEntryId.get(entry.id) ?? []}
                    onRemove={removeEntry}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </section>
    </div>
  );
}
