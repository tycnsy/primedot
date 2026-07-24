import { useEffect, useState } from 'react';
import type { PaceSettings, Project, Task } from '../lib/types';
import { buildPacePatchFromBufferSeconds } from '../lib/pace';
import { useClearPaceSettings, useUpsertPaceSettings } from '../hooks/usePaceSettings';
import { useUpdateProject } from '../hooks/useProjects';

interface Props {
  project: Project;
  tasks: Task[];
  pace: PaceSettings | null;
}

function toLocalInput(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local: string): string {
  return new Date(local).toISOString();
}

function tomorrowAtEightPmLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default function PaceSettingsForm({ project, tasks, pace }: Props) {
  const upsert = useUpsertPaceSettings(project.id);
  const clear = useClearPaceSettings(project.id);
  const updateProject = useUpdateProject();

  // "Set pace" — number + unit toggle
  const [paceAmount, setPaceAmount] = useState('2');
  const [paceUnit, setPaceUnit] = useState<'minutes' | 'hours'>('minutes');

  // "Set target time" — datetime input
  const [targetLocal, setTargetLocal] = useState<string>(
    pace ? toLocalInput(pace.target_deadline) : '',
  );

  // True deadline editor
  const [trueLocal, setTrueLocal] = useState<string>(
    pace ? toLocalInput(pace.true_deadline) : '',
  );
  const [hasManualLocalEdit, setHasManualLocalEdit] = useState(false);

  const [splitPct, setSplitPct] = useState(String(project.pace_split_percentage ?? 0));
  const [marginLimitHours, setMarginLimitHours] = useState(() => {
    const seconds = project.pace_margin_limit_seconds;
    if (seconds == null) return '';
    return String(Number(seconds) / 3600);
  });
  const [splitSavedFlash, setSplitSavedFlash] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTargetLocal('');
    setTrueLocal('');
    setHasManualLocalEdit(false);
    setSplitPct(String(project.pace_split_percentage ?? 0));
    const seconds = project.pace_margin_limit_seconds;
    setMarginLimitHours(seconds == null ? '' : String(Number(seconds) / 3600));
    setSplitSavedFlash(false);
  }, [project.id]);

  useEffect(() => {
    setSplitPct(String(project.pace_split_percentage ?? 0));
    const seconds = project.pace_margin_limit_seconds;
    setMarginLimitHours(seconds == null ? '' : String(Number(seconds) / 3600));
  }, [project.pace_split_percentage, project.pace_margin_limit_seconds]);

  useEffect(() => {
    if (!pace || hasManualLocalEdit) return;
    const nextTargetLocal = toLocalInput(pace.target_deadline);
    const nextTrueLocal = toLocalInput(pace.true_deadline);
    setTargetLocal(nextTargetLocal);
    setTrueLocal(nextTrueLocal);
  }, [project.id, pace, hasManualLocalEdit]);

  const handleSetPace = async () => {
    setError(null);
    const n = Number.parseFloat(paceAmount);
    if (!Number.isFinite(n)) return setError('Pace amount must be a number.');
    const bufferSeconds = paceUnit === 'minutes' ? n * 60 : n * 3600;
    const { target, patch } = buildPacePatchFromBufferSeconds(
      tasks,
      project,
      bufferSeconds,
      pace?.true_deadline,
    );
    try {
      await upsert.mutateAsync(patch);
      setTargetLocal(toLocalInput(target.toISOString()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set pace.');
    }
  };

  const handleSetTarget = async () => {
    setError(null);
    if (!targetLocal) return setError('Pick a target date/time first.');
    try {
      await upsert.mutateAsync({
        target_deadline: fromLocalInput(targetLocal),
        true_deadline:
          pace?.true_deadline ??
          new Date(
            new Date(targetLocal).getTime() + 7 * 86_400_000,
          ).toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set target.');
    }
  };

  const handleSetTomorrowAtEight = async () => {
    setError(null);
    const tomorrowLocal = tomorrowAtEightPmLocal();
    const tomorrowIso = fromLocalInput(tomorrowLocal);
    try {
      await upsert.mutateAsync({
        target_deadline: tomorrowIso,
        true_deadline:
          pace?.true_deadline ??
          new Date(new Date(tomorrowLocal).getTime() + 7 * 86_400_000).toISOString(),
      });
      setTargetLocal(tomorrowLocal);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set target.');
    }
  };

  const handleSetTrueDeadline = async () => {
    setError(null);
    if (!trueLocal) return setError('Pick a true deadline first.');
    try {
      await upsert.mutateAsync({
        true_deadline: fromLocalInput(trueLocal),
        target_deadline:
          pace?.target_deadline ?? new Date(trueLocal).toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set true deadline.');
    }
  };

  const handleCopyTargetToTrueDeadline = async () => {
    setError(null);
    if (!targetLocal) return setError('Pick a target date/time first.');
    const targetIso = fromLocalInput(targetLocal);
    try {
      await upsert.mutateAsync({
        target_deadline: targetIso,
        true_deadline: targetIso,
      });
      setTrueLocal(targetLocal);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to copy target time.');
    }
  };

  const handleCopyDueDateToTrueDeadline = async () => {
    setError(null);
    if (!project.due_date) return setError('Set a project due date first.');
    try {
      await upsert.mutateAsync({
        true_deadline: project.due_date,
        target_deadline: pace?.target_deadline ?? project.due_date,
      });
      setTrueLocal(toLocalInput(project.due_date));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to copy due date.');
    }
  };

  const handleCopyTrueDeadlineToTarget = async () => {
    setError(null);
    if (!trueLocal) return setError('Pick a true deadline first.');
    const trueIso = fromLocalInput(trueLocal);
    try {
      await upsert.mutateAsync({
        true_deadline: trueIso,
        target_deadline: trueIso,
      });
      setTargetLocal(trueLocal);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to copy true deadline.');
    }
  };

  const handleResetPace = async () => {
    setError(null);
    if (!pace) return setError('No pace is currently set.');
    if (!confirm('Reset pace? This clears target and true deadlines.')) return;
    try {
      await clear.mutateAsync();
      setTargetLocal('');
      setTrueLocal('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset pace.');
    }
  };

  const handleToggleSyncDueDate = async () => {
    setError(null);
    const next = !project.sync_true_deadline_with_due_date;
    try {
      await updateProject.mutateAsync({
        id: project.id,
        patch: next
          ? {
              sync_true_deadline_with_due_date: true,
              due_date: project.due_date,
            }
          : {
              sync_true_deadline_with_due_date: false,
            },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update deadline sync.');
    }
  };

  const handleSaveSplitSettings = async () => {
    setError(null);
    setSplitSavedFlash(false);
    const parsed = Number(splitPct);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setError('Enter a pace split percentage between 0 and 100.');
      return;
    }

    let paceMarginLimitSeconds: number | null = null;
    const trimmedLimit = marginLimitHours.trim();
    if (trimmedLimit !== '') {
      const hours = Number(trimmedLimit);
      if (!Number.isFinite(hours) || hours < 0) {
        setError('Margin limit must be empty (off) or a non-negative number of hours.');
        return;
      }
      paceMarginLimitSeconds = Math.round(hours * 3600);
    }

    try {
      await updateProject.mutateAsync({
        id: project.id,
        patch: {
          pace_split_percentage: Math.min(100, Math.max(0, parsed)),
          pace_margin_limit_seconds: paceMarginLimitSeconds,
        },
      });
      setSplitSavedFlash(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save pace split settings.');
    }
  };

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-semibold text-fg">Pace settings</h2>

      <div className="space-y-3 border-b border-border/60 pb-4">
        <label className="block space-y-2">
          <span className="label">Pace split percentage</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              className="input w-28"
              value={splitPct}
              disabled={updateProject.isPending}
              onChange={(e) => {
                setSplitSavedFlash(false);
                setSplitPct(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSaveSplitSettings();
              }}
            />
            <span className="text-sm text-muted">%</span>
          </div>
        </label>
        <p className="text-xs text-subtle">
          Share of buffer-only time moved into pace margin on progress. 0% leaves
          the target deadline unchanged.
        </p>

        <label className="block space-y-2">
          <span className="label">Pace margin limit</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={1}
              className="input w-28"
              value={marginLimitHours}
              placeholder="Off"
              disabled={updateProject.isPending}
              onChange={(e) => {
                setSplitSavedFlash(false);
                setMarginLimitHours(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSaveSplitSettings();
              }}
            />
            <span className="text-sm text-muted">hours</span>
          </div>
        </label>
        <p className="text-xs text-subtle">
          Empty = unlimited. When set, progress past this margin keeps margin at
          the limit and absorbs leftover into buffer.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-secondary"
            disabled={updateProject.isPending}
            onClick={() => void handleSaveSplitSettings()}
          >
            {updateProject.isPending ? 'Saving…' : 'Save split settings'}
          </button>
          {splitSavedFlash ? (
            <span className="text-sm text-success">Saved</span>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <div className="label">Set pace (buffer beyond timer estimate)</div>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            step="0.5"
            className="input flex-1"
            value={paceAmount}
            onChange={(e) => setPaceAmount(e.target.value)}
          />
          <button
            type="button"
            onClick={() =>
              setPaceUnit((prev) => (prev === 'minutes' ? 'hours' : 'minutes'))
            }
            className="btn-secondary w-32"
            aria-label={`Toggle pace unit (currently ${paceUnit})`}
          >
            {paceUnit}
          </button>
          <button onClick={handleSetPace} className="btn-primary whitespace-nowrap">
            Set pace
          </button>
        </div>
        <p className="text-xs text-subtle">
          target_deadline = estimated_completion + {paceAmount} {paceUnit}.
        </p>
      </div>

      <div className="space-y-2">
        <div className="label">Set target time</div>
        <div className="flex gap-2">
          <input
            type="datetime-local"
            className="input flex-1"
            value={targetLocal}
            onChange={(e) => {
              setHasManualLocalEdit(true);
              setTargetLocal(e.target.value);
            }}
          />
          <button onClick={handleSetTarget} className="btn-secondary whitespace-nowrap">
            Set target
          </button>
          <button
            onClick={handleCopyTrueDeadlineToTarget}
            className="btn-ghost whitespace-nowrap"
          >
            Copy true deadline
          </button>
          <button
            onClick={handleSetTomorrowAtEight}
            className="btn-ghost whitespace-nowrap"
          >
            Tomorrow 8:00 PM
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="label">True deadline</div>
        <div className="flex gap-2">
          <input
            type="datetime-local"
            className="input flex-1"
            value={trueLocal}
            onChange={(e) => {
              setHasManualLocalEdit(true);
              setTrueLocal(e.target.value);
            }}
          />
          <button
            onClick={handleSetTrueDeadline}
            className="btn-secondary whitespace-nowrap"
          >
            Save
          </button>
          <button
            onClick={handleCopyTargetToTrueDeadline}
            className="btn-ghost whitespace-nowrap"
          >
            Copy target
          </button>
          <button
            onClick={handleCopyDueDateToTrueDeadline}
            className="btn-ghost whitespace-nowrap"
          >
            Copy due date
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleToggleSyncDueDate}
          disabled={updateProject.isPending}
          aria-label="Sync True Deadline with Due Date"
          aria-pressed={project.sync_true_deadline_with_due_date}
          title="Sync True Deadline with Due Date"
          className="group inline-flex items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="sr-only">Sync True Deadline with Due Date</span>
          <span
            className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
              project.sync_true_deadline_with_due_date
                ? 'border-border bg-fg/15'
                : 'border-border/70 bg-surface2/60'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-fg transition-transform ${
                project.sync_true_deadline_with_due_date
                  ? 'translate-x-6'
                  : 'translate-x-1'
              }`}
            />
          </span>
        </button>

        <button
          type="button"
          onClick={handleResetPace}
          disabled={!pace || clear.isPending}
          className="btn-danger whitespace-nowrap disabled:opacity-60"
        >
          {clear.isPending ? 'Resetting…' : 'Reset pace'}
        </button>
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
