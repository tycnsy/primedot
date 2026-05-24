import { useMemo, useState } from 'react';
import { useUpdateProject } from '../hooks/useProjects';
import { useUpsertPaceSettings } from '../hooks/usePaceSettings';
import { buildRebalanceOutcome } from '../lib/pace';
import type { PaceSettings, Project, Task } from '../lib/types';
import ModalShell from './goals/ModalShell';

interface RebalanceModalProps {
  open: boolean;
  project: Project;
  tasks: Task[];
  pace: PaceSettings | null;
  onClose: () => void;
}

function formatDateTime(iso: string): string {
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

export default function RebalanceModal({
  open,
  project,
  tasks,
  pace,
  onClose,
}: RebalanceModalProps) {
  const updateProject = useUpdateProject();
  const upsertPace = useUpsertPaceSettings(project.id);

  const [amount, setAmount] = useState('2');
  const [unit, setUnit] = useState<'minutes' | 'hours'>('minutes');
  const [error, setError] = useState<string | null>(null);

  const offsetSeconds = useMemo(() => {
    const parsed = Number.parseFloat(amount);
    if (!Number.isFinite(parsed)) return Number.NaN;
    return unit === 'minutes' ? parsed * 60 : parsed * 3600;
  }, [amount, unit]);

  const outcome = useMemo(
    () => buildRebalanceOutcome(tasks, project, offsetSeconds),
    [offsetSeconds, project, tasks],
  );

  const handleClose = () => {
    if (updateProject.isPending || upsertPace.isPending) return;
    setError(null);
    onClose();
  };

  const handleApply = async () => {
    setError(null);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }

    const { bufferModifier, targetDeadlineIso } = outcome.result;
    const syncedDeadlineIso = pace?.true_deadline ?? targetDeadlineIso;

    try {
      await updateProject.mutateAsync({
        id: project.id,
        patch: { buffer_modifier: bufferModifier },
      });

      await upsertPace.mutateAsync({
        target_deadline: syncedDeadlineIso,
        true_deadline: syncedDeadlineIso,
      });

      setError(null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rebalance project.');
    }
  };

  const footer = (
    <>
      <button
        type="button"
        onClick={handleClose}
        className="btn-ghost"
        disabled={updateProject.isPending || upsertPace.isPending}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleApply}
        className="btn-primary"
        disabled={updateProject.isPending || upsertPace.isPending}
      >
        {updateProject.isPending || upsertPace.isPending ? 'Applying…' : 'Apply rebalance'}
      </button>
    </>
  );

  return (
    <ModalShell open={open} title="Rebalance project" onClose={handleClose} footer={footer}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Set the pace offset you want, then recalculate buffer modifier from due date pressure and
          unbuffered remaining work.
        </p>

        <div className="space-y-2">
          <div className="label">Desired pace offset</div>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.5"
              className="input flex-1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <button
              type="button"
              onClick={() => setUnit((prev) => (prev === 'minutes' ? 'hours' : 'minutes'))}
              className="btn-secondary w-32"
              aria-label={`Toggle rebalance unit (currently ${unit})`}
            >
              {unit}
            </button>
          </div>
        </div>

        {outcome.ok ? (
          <div className="rounded-xl border border-border bg-surface2/40 p-3 text-sm text-fg">
            <p>
              Target deadline: <span className="font-medium">{formatDateTime(outcome.result.targetDeadlineIso)}</span>
            </p>
            <p>
              Hour difference: <span className="font-medium">{outcome.result.hourDifferenceHours.toFixed(2)}h</span>
            </p>
            <p>
              Remaining (unbuffered):{' '}
              <span className="font-medium">{outcome.result.remainingHoursUnbuffered.toFixed(2)}h</span>
            </p>
            <p>
              New buffer modifier:{' '}
              <span className="font-medium">×{outcome.result.bufferModifier.toFixed(2)}</span>
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {outcome.message}
          </div>
        )}

        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    </ModalShell>
  );
}
