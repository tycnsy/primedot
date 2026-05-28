import { format, isToday, isTomorrow } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUpsertPaceSettings } from '../hooks/usePaceSettings';
import { useUpdateProject } from '../hooks/useProjects';
import { currentPace, currentPaceEnd, paceMargin } from '../lib/calc';
import { buildPacePatchFromBufferSeconds, buildRebalanceOutcome } from '../lib/pace';
import { formatHMS } from '../lib/time';
import type { PaceSettings, Project, Task } from '../lib/types';

const SET_PACE_AMOUNT_KEY = 'prime:pace-table:set-pace-amount';
const SET_PACE_UNIT_KEY = 'prime:pace-table:set-pace-unit';
const REBALANCE_AMOUNT_KEY = 'prime:pace-table:rebalance-amount';
const REBALANCE_UNIT_KEY = 'prime:pace-table:rebalance-unit';

type TimeUnit = 'minutes' | 'hours';

interface PaceGridTableProps {
  projects: Project[];
  tasksByProject: Record<string, Task[]>;
  paceByProject: Record<string, PaceSettings>;
  now: Date;
  isLoading: boolean;
}

interface PaceGridTableRowProps {
  project: Project;
  tasks: Task[];
  pace: PaceSettings | null;
  now: Date;
  isLoading: boolean;
  setPaceSeconds: number;
  rebalanceOffsetSeconds: number;
}

function formatPaceEnd(date: Date | null): string {
  if (!date) return 'No pace end';
  if (isToday(date)) return `Today, ${format(date, 'h:mm a')}`;
  if (isTomorrow(date)) return `Tomorrow, ${format(date, 'h:mm a')}`;
  return format(date, 'MMM d, h:mm a');
}

function safeReadLocalStorage(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function toTimeUnit(value: string, fallback: TimeUnit): TimeUnit {
  return value === 'hours' || value === 'minutes' ? value : fallback;
}

function toSeconds(amount: string, unit: TimeUnit): number {
  const parsed = Number.parseFloat(amount);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return unit === 'minutes' ? parsed * 60 : parsed * 3600;
}

function PaceGridTableRow({
  project,
  tasks,
  pace,
  now,
  isLoading,
  setPaceSeconds,
  rebalanceOffsetSeconds,
}: PaceGridTableRowProps) {
  const upsertPace = useUpsertPaceSettings(project.id);
  const updateProject = useUpdateProject();
  const [error, setError] = useState<string | null>(null);

  const isMutating = upsertPace.isPending || updateProject.isPending;
  const showComputed = !!pace && !isLoading;
  const paceSeconds = showComputed ? currentPace(tasks, project, pace, now) : null;
  const marginSeconds = showComputed ? paceMargin(pace) : null;
  const paceEnd = showComputed ? currentPaceEnd(tasks, project, pace) : null;

  const handleSetPace = async () => {
    setError(null);
    if (!Number.isFinite(setPaceSeconds)) {
      setError('Set pace amount must be a valid number.');
      return;
    }
    try {
      const { patch } = buildPacePatchFromBufferSeconds(
        tasks,
        project,
        setPaceSeconds,
        pace?.true_deadline,
      );
      await upsertPace.mutateAsync(patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set pace.');
    }
  };

  const handleRebalance = async () => {
    setError(null);
    if (!Number.isFinite(rebalanceOffsetSeconds)) {
      setError('Rebalance amount must be a valid number.');
      return;
    }

    const outcome = buildRebalanceOutcome(tasks, project, rebalanceOffsetSeconds, now);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rebalance project.');
    }
  };

  const rowTintClass =
    paceSeconds == null
      ? ''
      : paceSeconds < 0
        ? 'bg-danger/10'
        : paceSeconds < 3600
          ? 'bg-warn/10'
        : 'bg-success/10';

  return (
    <tr className={`border-t border-border/60 align-top ${rowTintClass}`}>
      <td className="px-3 py-2">
        <Link to={`/projects/${project.id}?tab=pace`} className="font-medium text-fg hover:underline">
          {project.name}
        </Link>
      </td>
      <td className="px-3 py-2 font-sans tabular-nums text-fg">
        {paceSeconds == null ? (isLoading ? 'Loading...' : 'No pace') : formatHMS(paceSeconds)}
      </td>
      <td
        className={`px-3 py-2 font-sans tabular-nums ${
          marginSeconds == null ? 'text-muted' : marginSeconds < 0 ? 'text-danger' : 'text-fg'
        }`}
      >
        {marginSeconds == null ? (isLoading ? 'Loading...' : 'No pace') : formatHMS(marginSeconds)}
      </td>
      <td className="px-3 py-2 text-fg/90">
        {isLoading ? 'Loading...' : formatPaceEnd(paceEnd)}
      </td>
      <td className="px-3 py-2 font-sans tabular-nums text-fg">x{project.buffer_modifier.toFixed(2)}</td>
      <td className="px-3 py-2 text-center">
        <button
          type="button"
          onClick={handleSetPace}
          className="btn-secondary !h-6 !w-6 !bg-white !p-0 !text-fg"
          aria-label="Set pace"
          title="Set pace"
          disabled={isMutating}
        />
      </td>
      <td className="px-3 py-2 text-center">
        <div className="space-y-1">
          <button
            type="button"
            onClick={handleRebalance}
            className="btn-primary !h-6 !w-6 !p-0"
            aria-label="Rebalance"
            title="Rebalance"
            disabled={isMutating}
          />
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      </td>
    </tr>
  );
}

export default function PaceGridTable({
  projects,
  tasksByProject,
  paceByProject,
  now,
  isLoading,
}: PaceGridTableProps) {
  const [setPaceAmount, setSetPaceAmount] = useState<string>(() =>
    safeReadLocalStorage(SET_PACE_AMOUNT_KEY, '2'),
  );
  const [setPaceUnit, setSetPaceUnit] = useState<TimeUnit>(() =>
    toTimeUnit(safeReadLocalStorage(SET_PACE_UNIT_KEY, 'minutes'), 'minutes'),
  );
  const [rebalanceAmount, setRebalanceAmount] = useState<string>(() =>
    safeReadLocalStorage(REBALANCE_AMOUNT_KEY, '2'),
  );
  const [rebalanceUnit, setRebalanceUnit] = useState<TimeUnit>(() =>
    toTimeUnit(safeReadLocalStorage(REBALANCE_UNIT_KEY, 'minutes'), 'minutes'),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SET_PACE_AMOUNT_KEY, setPaceAmount);
    } catch {
      // localStorage may be unavailable; ignore persistence.
    }
  }, [setPaceAmount]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SET_PACE_UNIT_KEY, setPaceUnit);
    } catch {
      // localStorage may be unavailable; ignore persistence.
    }
  }, [setPaceUnit]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(REBALANCE_AMOUNT_KEY, rebalanceAmount);
    } catch {
      // localStorage may be unavailable; ignore persistence.
    }
  }, [rebalanceAmount]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(REBALANCE_UNIT_KEY, rebalanceUnit);
    } catch {
      // localStorage may be unavailable; ignore persistence.
    }
  }, [rebalanceUnit]);

  const setPaceSeconds = useMemo(
    () => toSeconds(setPaceAmount, setPaceUnit),
    [setPaceAmount, setPaceUnit],
  );
  const rebalanceOffsetSeconds = useMemo(
    () => toSeconds(rebalanceAmount, rebalanceUnit),
    [rebalanceAmount, rebalanceUnit],
  );

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="label">Set pace amount</div>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.5"
                className="input flex-1"
                value={setPaceAmount}
                onChange={(event) => setSetPaceAmount(event.target.value)}
              />
              <button
                type="button"
                onClick={() =>
                  setSetPaceUnit((prev) => (prev === 'minutes' ? 'hours' : 'minutes'))
                }
                className="btn-secondary w-32"
                aria-label={`Toggle set pace unit (currently ${setPaceUnit})`}
              >
                {setPaceUnit}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <div className="label">Rebalance amount</div>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.5"
                className="input flex-1"
                value={rebalanceAmount}
                onChange={(event) => setRebalanceAmount(event.target.value)}
              />
              <button
                type="button"
                onClick={() =>
                  setRebalanceUnit((prev) => (prev === 'minutes' ? 'hours' : 'minutes'))
                }
                className="btn-secondary w-32"
                aria-label={`Toggle rebalance unit (currently ${rebalanceUnit})`}
              >
                {rebalanceUnit}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead className="bg-surface2/50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Current pace</th>
              <th className="px-3 py-2 font-semibold">Pace margin</th>
              <th className="px-3 py-2 font-semibold">Current pace end</th>
              <th className="px-3 py-2 font-semibold">Buffer</th>
              <th className="px-3 py-2 font-semibold text-right">Set pace</th>
              <th className="px-3 py-2 font-semibold text-right">Rebalance</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <PaceGridTableRow
                key={project.id}
                project={project}
                tasks={tasksByProject[project.id] ?? []}
                pace={paceByProject[project.id] ?? null}
                now={now}
                isLoading={isLoading}
                setPaceSeconds={setPaceSeconds}
                rebalanceOffsetSeconds={rebalanceOffsetSeconds}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
