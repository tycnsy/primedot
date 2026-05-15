import { useEffect, useState } from 'react';
import type { Project, Task } from '../lib/types';
import {
  calculatedProgress,
  deriveTaskStatus,
  progressTarget,
  taskLength,
} from '../lib/calc';
import { formatHMS, parseHMSWithOptionalFrames } from '../lib/time';

interface Props {
  task: Task;
  project: Project;
  onUpdateProgress?: (taskId: string, nextProgress: number) => Promise<void>;
  progressInputDisabled?: boolean;
  onEdit?: () => void;
  onDone?: () => void;
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
  onUpdateProgress,
  progressInputDisabled,
  onEdit,
  onDone,
}: Props) {
  const tLen = taskLength(task, project);
  const cProg = calculatedProgress(task, project);
  const status = deriveTaskStatus(task, project);
  const target = progressTarget(task, project);
  const pct = tLen > 0 ? Math.min(100, (cProg / tLen) * 100) : 0;
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
  }, [isCustom, task.current_progress]);

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
    if (next === task.current_progress) return;
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
    ? `${task.current_progress} / ${target > 0 ? target : '?'}`
    : `${formatHMS(task.current_progress)} / ${
        target > 0 ? formatHMS(target) : '?'
      }`;

  return (
    <div className="card transition-[box-shadow,border-color] duration-150 hover:shadow-elev1 hover:border-border/80 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyles[status]}`}
            aria-label={status}
          >
            {statusLabels[status]}
          </span>
          <span className="pill">{task.type}</span>
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
        </div>

        <div className="progress-track !h-1.5">
          <div
            className={`progress-fill ${isDone ? 'progress-fill-success' : ''}`}
            style={{ width: `${pct}%` }}
            aria-hidden
          />
        </div>
      </div>

      {(onUpdateProgress || onEdit || onDone) && (
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
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

function formatRemaining(seconds: number): string {
  const totalMinutes = Math.ceil(Math.max(0, seconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}min`;
  return `${minutes}min`;
}
