import { useState } from 'react';
import type { PaceSettings, Project, Task } from '../lib/types';
import { buildPacePatchFromBufferSeconds } from '../lib/pace';
import { useUpsertPaceSettings } from '../hooks/usePaceSettings';

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

  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-semibold text-fg">Pace settings</h2>

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
            onChange={(e) => setTargetLocal(e.target.value)}
          />
          <button onClick={handleSetTarget} className="btn-secondary whitespace-nowrap">
            Set target
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
            onChange={(e) => setTrueLocal(e.target.value)}
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
        </div>
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
