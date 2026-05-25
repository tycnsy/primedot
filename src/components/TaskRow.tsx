import { useEffect, useState } from 'react';
import type { ComplexMode, Project, Task } from '../lib/types';
import {
  calculatedProgress,
  complexParentEffectiveModifier,
  complexParentEffectiveProgress,
  deriveTaskStatus,
  progressTarget,
  taskLength,
} from '../lib/calc';
import { formatHMS, parseHMSWithOptionalFrames } from '../lib/time';

interface Props {
  task: Task;
  project: Project;
  allTasks?: Task[];
  onUpdateProgress?: (taskId: string, nextProgress: number) => Promise<void>;
  progressInputDisabled?: boolean;
  onEdit?: () => void;
  onDone?: () => void;
  /** Open the Complex Task settings modal (parent only). */
  onOpenComplexSettings?: () => void;
  /** Toggle the parent between compressed/expanded modes (parent only). */
  onToggleComplexMode?: (next: ComplexMode) => void;
  /** Collapse this subtask back into the parent (subtask only). */
  onCompressFromSubtask?: () => void;
  /** Visually indent / mark this row as a subtask. */
  isSubtask?: boolean;
}

const statusStyles: Record<Task['status'], string> = {
  not_started:
    'bg-surface2 text-muted ring-1 ring-inset ring-border',
  in_progress:
    'bg-accent/15 text-accent ring-1 ring-inset ring-accent/30',
  complete:
    'bg-success/15 text-success ring-1 ring-inset ring-success/30',
};
const statusLabels: Record<Task['status'], string> = {
  not_started: 'not started',
  in_progress: 'in progress',
  complete: 'done',
};

export default function TaskRow({
  task,
  project,
  allTasks,
  onUpdateProgress,
  progressInputDisabled,
  onEdit,
  onDone,
  onOpenComplexSettings,
  onToggleComplexMode,
  onCompressFromSubtask,
  isSubtask,
}: Props) {
  const isExpandedHeader = task.complex_mode === 'expanded';
  const isCompressedParent = task.complex_mode === 'compressed';

  if (isExpandedHeader) {
    return (
      <ComplexExpandedHeader
        task={task}
        allTasks={allTasks}
        onOpenComplexSettings={onOpenComplexSettings}
        onToggleComplexMode={onToggleComplexMode}
        onEdit={onEdit}
      />
    );
  }

  const tLen = taskLength(task, project, allTasks);
  const cProg = calculatedProgress(task, project, allTasks);
  const status = deriveTaskStatus(task, project, allTasks);
  const target = progressTarget(task, project);
  const pct = tLen > 0 ? Math.min(100, (cProg / tLen) * 100) : 0;
  const isCustom = task.type === 'custom';

  const displayedProgress =
    isCompressedParent && allTasks
      ? complexParentEffectiveProgress(task, allTasks)
      : task.current_progress;

  const [draft, setDraft] = useState(
    isCustom ? String(displayedProgress) : formatHMS(displayedProgress),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(
      isCustom ? String(displayedProgress) : formatHMS(displayedProgress),
    );
  }, [isCustom, displayedProgress]);

  const commitProgress = async () => {
    if (!onUpdateProgress) return;
    setError(null);
    let next: number;
    if (isCustom) {
      const n = Number.parseInt(draft, 10);
      if (!Number.isFinite(n) || n < 0)
        return setError('Whole non-negative number required.');
      next = n;
    } else {
      const sec = parseHMSWithOptionalFrames(draft);
      if (sec == null) return setError('Format hh:mm:ss or hh:mm:ss:ff.');
      next = sec;
    }
    if (next === displayedProgress) return;
    try {
      await onUpdateProgress(task.id, next);
      setDraft(isCustom ? String(next) : formatHMS(next));
    } catch {
      setError('Unable to save progress right now.');
    }
  };

  const isDone = tLen > 0 && cProg >= tLen - 1e-6;
  const remainingSeconds = Math.max(0, tLen - cProg);

  const progressLabel = isCustom
    ? `${displayedProgress} / ${target > 0 ? target : '?'}`
    : `${formatHMS(displayedProgress)} / ${
        target > 0 ? formatHMS(target) : '?'
      }`;

  const rolledUpModifier =
    isCompressedParent && allTasks
      ? complexParentEffectiveModifier(task, allTasks)
      : null;

  return (
    <div
      className={`card transition-[box-shadow,border-color] duration-150 hover:shadow-elev1 hover:border-border/80 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${
        isSubtask ? 'ml-0 sm:ml-6 border-l-2 border-l-accent/30' : ''
      }`}
    >
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyles[status]}`}
            aria-label={status}
          >
            {statusLabels[status]}
          </span>
          <span className="pill">{task.type}</span>
          {isSubtask ? <span className="pill">subtask</span> : null}
          {isCompressedParent ? <span className="pill">complex</span> : null}
          <h3 className="text-sm font-medium text-fg">{task.name}</h3>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="font-sans tabular-nums text-fg/90">
            {formatRemaining(remainingSeconds)}
          </span>
          <span className="text-subtle" aria-hidden>•</span>
          <span className="font-sans tabular-nums">
            {progressLabel}
          </span>
          {rolledUpModifier != null ? (
            <>
              <span className="text-subtle" aria-hidden>•</span>
              <span className="font-sans tabular-nums">
                ×{rolledUpModifier.toFixed(2)}
              </span>
            </>
          ) : null}
        </div>

        <div className="progress-track !h-1.5">
          <div
            className={`progress-fill ${isDone ? 'progress-fill-success' : ''}`}
            style={{ width: `${pct}%` }}
            aria-hidden
          />
        </div>
      </div>

      {(onUpdateProgress ||
        onEdit ||
        onDone ||
        isCompressedParent ||
        isSubtask) && (
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {isCompressedParent && onToggleComplexMode ? (
              <ComplexModeToggle
                mode="compressed"
                onChange={onToggleComplexMode}
              />
            ) : null}
            {isCompressedParent && onOpenComplexSettings ? (
              <button
                type="button"
                onClick={onOpenComplexSettings}
                className="btn-ghost"
                aria-label="Complex task settings"
                title="Complex task settings"
              >
                Subtasks…
              </button>
            ) : null}
            {isSubtask && onCompressFromSubtask ? (
              <button
                type="button"
                onClick={onCompressFromSubtask}
                className="btn-ghost"
                aria-label="Compress into one task"
                title="Compress into one task"
              >
                Compress
              </button>
            ) : null}
            {onUpdateProgress ? (
              <input
                className={`input h-9 w-44 ${isCustom ? '' : 'font-sans tabular-nums'}`}
                value={draft}
                disabled={progressInputDisabled}
                aria-label={`Current progress for ${task.name}`}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setError(null);
                }}
                onBlur={() => {
                  void commitProgress();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            ) : null}
            {onEdit ? (
              <button onClick={onEdit} className="btn-ghost">
                Edit
              </button>
            ) : null}
            {onDone ? (
              <button
                onClick={onDone}
                disabled={isDone}
                className={isDone ? 'btn-secondary' : 'btn-success'}
              >
                Done
              </button>
            ) : null}
          </div>
          {error ? <span className="text-xs text-danger">{error}</span> : null}
        </div>
      )}
    </div>
  );
}

interface ExpandedHeaderProps {
  task: Task;
  allTasks?: Task[];
  onOpenComplexSettings?: () => void;
  onToggleComplexMode?: (next: ComplexMode) => void;
  onEdit?: () => void;
}

function ComplexExpandedHeader({
  task,
  allTasks,
  onOpenComplexSettings,
  onToggleComplexMode,
  onEdit,
}: ExpandedHeaderProps) {
  const modifier =
    allTasks ? complexParentEffectiveModifier(task, allTasks) : null;

  return (
    <div className="card flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-dashed">
      <div className="flex flex-1 items-center gap-2 flex-wrap">
        <span className="pill">complex</span>
        <h3 className="text-sm font-medium text-fg">{task.name}</h3>
        {modifier != null ? (
          <span className="text-xs text-muted font-sans tabular-nums">
            ×{modifier.toFixed(2)} (rolled up)
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {onToggleComplexMode ? (
          <ComplexModeToggle mode="expanded" onChange={onToggleComplexMode} />
        ) : null}
        {onOpenComplexSettings ? (
          <button
            type="button"
            onClick={onOpenComplexSettings}
            className="btn-ghost"
            title="Complex task settings"
          >
            Subtasks…
          </button>
        ) : null}
        {onEdit ? (
          <button onClick={onEdit} className="btn-ghost">
            Edit
          </button>
        ) : null}
      </div>
    </div>
  );
}

interface ComplexModeToggleProps {
  mode: ComplexMode;
  onChange: (next: ComplexMode) => void;
}

function ComplexModeToggle({ mode, onChange }: ComplexModeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Complex task mode"
      className="inline-flex items-center rounded-full border border-border bg-surface2 p-0.5 text-[11px] font-medium"
    >
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'compressed'}
        onClick={() => mode !== 'compressed' && onChange('compressed')}
        className={`px-2 py-0.5 rounded-full transition-colors ${
          mode === 'compressed'
            ? 'bg-accent/15 text-accent'
            : 'text-muted hover:text-fg'
        }`}
      >
        Compressed
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'expanded'}
        onClick={() => mode !== 'expanded' && onChange('expanded')}
        className={`px-2 py-0.5 rounded-full transition-colors ${
          mode === 'expanded'
            ? 'bg-accent/15 text-accent'
            : 'text-muted hover:text-fg'
        }`}
      >
        Expanded
      </button>
    </div>
  );
}

function formatRemaining(seconds: number): string {
  const totalMinutes = Math.ceil(Math.max(0, seconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}min`;
  return `${minutes}min`;
}
