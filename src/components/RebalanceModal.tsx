import { useMemo, useState } from 'react';
import { useUpdateProject } from '../hooks/useProjects';
import { useUpsertPaceSettings } from '../hooks/usePaceSettings';
import { buildRebalanceOutcome, buildRebalancePredictionOutcome } from '../lib/pace';
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

function formatHoursMinutes(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const sign = totalMinutes < 0 ? '-' : '';
  const absoluteMinutes = Math.abs(totalMinutes);
  const wholeHours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  return `${sign}${wholeHours}h ${minutes}m`;
}

export default function RebalanceModal({
  open,
  project,
  tasks,
  pace,
  onClose,
}: RebalanceModalProps) {
  const [activeTab, setActiveTab] = useState<'rebalance' | 'prediction'>('rebalance');
  const updateProject = useUpdateProject();
  const upsertPace = useUpsertPaceSettings(project.id);

  const [amount, setAmount] = useState('2');
  const [unit, setUnit] = useState<'minutes' | 'hours'>('minutes');
  const [predictionAmount, setPredictionAmount] = useState('2');
  const [predictionUnit, setPredictionUnit] = useState<'minutes' | 'hours'>('minutes');
  const [predictionMethod, setPredictionMethod] = useState<'hours_to_buffer' | 'buffer_to_hours'>(
    'hours_to_buffer',
  );
  const [plannedWorkHours, setPlannedWorkHours] = useState('0');
  const [targetBufferModifier, setTargetBufferModifier] = useState('1');
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

  const predictionOffsetSeconds = useMemo(() => {
    const parsed = Number.parseFloat(predictionAmount);
    if (!Number.isFinite(parsed)) return Number.NaN;
    return predictionUnit === 'minutes' ? parsed * 60 : parsed * 3600;
  }, [predictionAmount, predictionUnit]);

  const predictionOutcome = useMemo(() => {
    if (predictionMethod === 'hours_to_buffer') {
      return buildRebalancePredictionOutcome(tasks, project, predictionOffsetSeconds, {
        mode: 'hours_to_buffer',
        plannedWorkHours: Number.parseFloat(plannedWorkHours),
      });
    }

    return buildRebalancePredictionOutcome(tasks, project, predictionOffsetSeconds, {
      mode: 'buffer_to_hours',
      targetBufferModifier: Number.parseFloat(targetBufferModifier),
    });
  }, [
    plannedWorkHours,
    predictionMethod,
    predictionOffsetSeconds,
    project,
    targetBufferModifier,
    tasks,
  ]);

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
      {activeTab === 'rebalance' ? (
        <button
          type="button"
          onClick={handleApply}
          className="btn-primary"
          disabled={updateProject.isPending || upsertPace.isPending}
        >
          {updateProject.isPending || upsertPace.isPending ? 'Applying…' : 'Apply rebalance'}
        </button>
      ) : null}
    </>
  );

  return (
    <ModalShell open={open} title="Rebalance project" onClose={handleClose} footer={footer}>
      <div className="space-y-4">
        <div className="segmented">
          <button
            type="button"
            data-active={activeTab === 'rebalance'}
            onClick={() => setActiveTab('rebalance')}
          >
            Rebalance
          </button>
          <button
            type="button"
            data-active={activeTab === 'prediction'}
            onClick={() => setActiveTab('prediction')}
          >
            Prediction
          </button>
        </div>

        {activeTab === 'rebalance' ? (
          <>
            <p className="text-sm text-muted">
              Set the pace offset you want, then recalculate buffer modifier from due date pressure
              and unbuffered remaining work.
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
                  Target deadline:{' '}
                  <span className="font-medium">{formatDateTime(outcome.result.targetDeadlineIso)}</span>
                </p>
                <p>
                  Hour difference:{' '}
                  <span className="font-medium">{outcome.result.hourDifferenceHours.toFixed(2)}h</span>
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
          </>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Estimate how planned work and pace offset change your rebalance outcome. This tab is a
              calculator only and does not apply updates.
            </p>
            <p className="text-xs text-muted">
              Planned/required work is measured in buffered hours at your current project modifier (
              ×{project.buffer_modifier.toFixed(2)}).
            </p>

            <div className="space-y-2">
              <div className="label">Desired pace offset</div>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.5"
                  className="input flex-1"
                  value={predictionAmount}
                  onChange={(event) => setPredictionAmount(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() =>
                    setPredictionUnit((prev) => (prev === 'minutes' ? 'hours' : 'minutes'))
                  }
                  className="btn-secondary w-32"
                  aria-label={`Toggle prediction unit (currently ${predictionUnit})`}
                >
                  {predictionUnit}
                </button>
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="label">Prediction method</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="prediction-mode"
                  checked={predictionMethod === 'hours_to_buffer'}
                  onChange={() => setPredictionMethod('hours_to_buffer')}
                />
                Buffered hours completed to estimate resulting buffer modifier
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="prediction-mode"
                  checked={predictionMethod === 'buffer_to_hours'}
                  onChange={() => setPredictionMethod('buffer_to_hours')}
                />
                Target buffer modifier to estimate required buffered work hours
              </label>
            </fieldset>

            {predictionMethod === 'hours_to_buffer' ? (
              <div className="space-y-2">
                <div className="label">Planned buffered work hours</div>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="input"
                  value={plannedWorkHours}
                  onChange={(event) => setPlannedWorkHours(event.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="label">Target buffer modifier</div>
                <input
                  type="number"
                  min="0.01"
                  step="1"
                  className="input"
                  value={targetBufferModifier}
                  onChange={(event) => setTargetBufferModifier(event.target.value)}
                />
              </div>
            )}

            {predictionOutcome.ok ? (
              <div className="rounded-xl border border-border bg-surface2/40 p-3 text-sm text-fg">
                <p>
                  Time available (after offset):{' '}
                  <span className="font-medium">
                    {predictionOutcome.result.hourDifferenceHours.toFixed(2)}h (
                    {formatHoursMinutes(predictionOutcome.result.hourDifferenceHours)})
                  </span>
                </p>
                <p>
                  Remaining work (unbuffered):{' '}
                  <span className="font-medium">
                    {predictionOutcome.result.remainingHoursUnbuffered.toFixed(2)}h (
                    {formatHoursMinutes(predictionOutcome.result.remainingHoursUnbuffered)})
                  </span>
                </p>
                {predictionOutcome.result.mode === 'hours_to_buffer' ? (
                  <>
                    <p>
                      Remaining after planned work (unbuffered basis):{' '}
                      <span className="font-medium">
                        {predictionOutcome.result.remainingHoursAfterPlannedWork.toFixed(2)}h (
                        {formatHoursMinutes(predictionOutcome.result.remainingHoursAfterPlannedWork)}
                        )
                      </span>
                    </p>
                    <p>
                      Predicted buffer modifier:{' '}
                      <span className="font-medium">
                        ×{predictionOutcome.result.predictedBufferModifier.toFixed(2)}
                      </span>
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      Estimated buffered work needed:{' '}
                      <span className="font-medium">
                        {predictionOutcome.result.requiredWorkHoursClamped.toFixed(2)}h (
                        {formatHoursMinutes(predictionOutcome.result.requiredWorkHoursClamped)})
                      </span>
                    </p>
                    {predictionOutcome.result.clampedToZero ? (
                      <p className="text-xs text-muted">
                        Raw estimate was below zero, so required work is clamped to 0h.
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
                {predictionOutcome.message}
              </div>
            )}
          </div>
        )}
        {activeTab === 'rebalance' && error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    </ModalShell>
  );
}
