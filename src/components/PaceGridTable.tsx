import { format, isToday, isTomorrow } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUpsertPaceSettings } from '../hooks/usePaceSettings';
import { useUpdateProject } from '../hooks/useProjects';
import ModalShell from './goals/ModalShell';
import {
  bufferModifierGoal,
  currentPace,
  currentPaceEnd,
  paceMargin,
} from '../lib/calc';
import {
  buildPacePatchFromBufferSeconds,
  buildRebalanceOutcome,
  buildRebalancePredictionOutcome,
} from '../lib/pace';
import { formatHMS } from '../lib/time';
import type { PaceSettings, Project, Task } from '../lib/types';

const SET_PACE_AMOUNT_KEY = 'prime:pace-table:set-pace-amount';
const SET_PACE_UNIT_KEY = 'prime:pace-table:set-pace-unit';
const REBALANCE_AMOUNT_KEY = 'prime:pace-table:rebalance-amount';
const REBALANCE_UNIT_KEY = 'prime:pace-table:rebalance-unit';
const VISIBLE_COLUMNS_KEY = 'prime:pace-table:visible-columns';

type TimeUnit = 'minutes' | 'hours';
type PaceColumnId =
  | 'name'
  | 'currentPace'
  | 'paceMargin'
  | 'currentPaceEnd'
  | 'buffer'
  | 'bufferModifierGoal'
  | 'paceToGoal'
  | 'setPace'
  | 'rebalance';

const TABLE_COLUMNS: readonly PaceColumnId[] = [
  'name',
  'currentPace',
  'paceMargin',
  'currentPaceEnd',
  'buffer',
  'bufferModifierGoal',
  'paceToGoal',
  'setPace',
  'rebalance',
];

const COLUMN_LABELS: Record<PaceColumnId, string> = {
  name: 'Name',
  currentPace: 'Current pace',
  paceMargin: 'Pace margin',
  currentPaceEnd: 'Pace Ends @',
  buffer: 'Buffer',
  bufferModifierGoal: 'Buffer Goal',
  paceToGoal: 'Pace for goal',
  setPace: 'Set pace',
  rebalance: 'Rebalance',
};

interface PaceGridTableProps {
  projects: Project[];
  tasksByProject: Record<string, Task[]>;
  paceByProject: Record<string, PaceSettings>;
  now: Date;
  isLoading: boolean;
  openColumnsSignal?: number;
  viewAllMode?: boolean;
}

interface PaceGridTableRowProps {
  project: Project;
  tasks: Task[];
  pace: PaceSettings | null;
  now: Date;
  isLoading: boolean;
  setPaceSeconds: number;
  rebalanceOffsetSeconds: number;
  visibleColumns: Set<PaceColumnId>;
  viewAllMode: boolean;
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

function parseVisibleColumns(value: string): Set<PaceColumnId> {
  const parsedColumns = value
    .split(',')
    .map((column) => column.trim())
    .filter((column): column is PaceColumnId =>
      TABLE_COLUMNS.includes(column as PaceColumnId),
    );

  if (parsedColumns.length === 0) {
    return new Set(TABLE_COLUMNS);
  }

  return new Set(parsedColumns);
}

function PaceGridTableRow({
  project,
  tasks,
  pace,
  now,
  isLoading,
  setPaceSeconds,
  rebalanceOffsetSeconds,
  visibleColumns,
  viewAllMode,
}: PaceGridTableRowProps) {
  const upsertPace = useUpsertPaceSettings(project.id);
  const updateProject = useUpdateProject();
  const [error, setError] = useState<string | null>(null);

  const isMutating = upsertPace.isPending || updateProject.isPending;
  const showComputed = !!pace && !isLoading;
  const paceSeconds = showComputed ? currentPace(tasks, project, pace, now) : null;
  const marginSeconds = showComputed ? paceMargin(pace) : null;
  const paceEnd = showComputed ? currentPaceEnd(tasks, project, pace) : null;
  const goalBufferModifier = bufferModifierGoal(tasks, project);
  let paceToGoalSeconds: number | null = null;
  if (showComputed && paceSeconds != null && goalBufferModifier != null) {
    const prediction = buildRebalancePredictionOutcome(
      tasks,
      project,
      0,
      { mode: 'buffer_to_hours', targetBufferModifier: goalBufferModifier },
      now,
    );
    if (
      prediction.ok &&
      prediction.result.mode === 'buffer_to_hours' &&
      prediction.result.requiredWorkHoursClamped > 0
    ) {
      paceToGoalSeconds = paceSeconds + prediction.result.requiredWorkHoursClamped * 3600;
    }
  }
  const bufferClassName =
    goalBufferModifier == null
      ? 'text-fg'
      : Math.round(project.buffer_modifier * 100) < Math.round(goalBufferModifier * 100)
        ? 'font-semibold text-danger'
        : 'font-semibold text-success';

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
    if (viewAllMode) {
      if (goalBufferModifier == null) {
        setError('No buffer goal available. Set a due date and tasks.');
        return;
      }
      const bufferModifier = Math.round(goalBufferModifier * 100) / 100;
      try {
        await updateProject.mutateAsync({
          id: project.id,
          patch: { buffer_modifier: bufferModifier },
        });
        if (pace?.true_deadline) {
          await upsertPace.mutateAsync({
            target_deadline: pace.true_deadline,
            true_deadline: pace.true_deadline,
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to set buffer to goal.');
      }
      return;
    }

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
      {visibleColumns.has('name') ? (
        <td className="px-3 py-2">
          <Link to={`/projects/${project.id}?tab=pace`} className="font-medium text-fg hover:underline">
            {project.name}
          </Link>
        </td>
      ) : null}
      {visibleColumns.has('currentPace') ? (
        <td className="px-3 py-2 text-center font-sans tabular-nums text-fg">
          {paceSeconds == null ? (isLoading ? 'Loading...' : 'No pace') : formatHMS(paceSeconds)}
        </td>
      ) : null}
      {visibleColumns.has('paceMargin') ? (
        <td
          className={`px-3 py-2 text-center font-sans tabular-nums ${
            marginSeconds == null ? 'text-muted' : marginSeconds < 0 ? 'text-danger' : 'text-fg'
          }`}
        >
          {marginSeconds == null
            ? isLoading
              ? 'Loading...'
              : 'No pace'
            : formatHMS(marginSeconds)}
        </td>
      ) : null}
      {visibleColumns.has('currentPaceEnd') ? (
        <td className="px-3 py-2 text-center text-fg/90">
          {isLoading ? 'Loading...' : formatPaceEnd(paceEnd)}
        </td>
      ) : null}
      {visibleColumns.has('buffer') ? (
        <td className={`px-3 py-2 text-center font-sans tabular-nums ${bufferClassName}`}>
          x{project.buffer_modifier.toFixed(2)}
        </td>
      ) : null}
      {visibleColumns.has('bufferModifierGoal') ? (
        <td className="px-3 py-2 text-center font-sans tabular-nums text-fg">
          {goalBufferModifier == null ? '—' : `x${goalBufferModifier.toFixed(2)}`}
        </td>
      ) : null}
      {visibleColumns.has('paceToGoal') ? (
        <td className="px-3 py-2 text-center font-sans tabular-nums text-fg">
          {paceToGoalSeconds == null ? '—' : formatHMS(paceToGoalSeconds)}
        </td>
      ) : null}
      {visibleColumns.has('setPace') ? (
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
      ) : null}
      {visibleColumns.has('rebalance') ? (
        <td className="px-3 py-2 text-center">
          {viewAllMode && goalBufferModifier == null ? (
            <span className="text-muted">—</span>
          ) : (
            <div className="space-y-1">
              <button
                type="button"
                onClick={handleRebalance}
                className="btn-primary !h-6 !w-6 !p-0"
                aria-label={viewAllMode ? 'Set buffer to goal' : 'Rebalance'}
                title={viewAllMode ? 'Set buffer to goal' : 'Rebalance'}
                disabled={isMutating}
              />
              {error ? <p className="text-xs text-danger">{error}</p> : null}
            </div>
          )}
        </td>
      ) : null}
    </tr>
  );
}

export default function PaceGridTable({
  projects,
  tasksByProject,
  paceByProject,
  now,
  isLoading,
  openColumnsSignal = 0,
  viewAllMode = false,
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
  const [visibleColumns, setVisibleColumns] = useState<Set<PaceColumnId>>(() =>
    parseVisibleColumns(safeReadLocalStorage(VISIBLE_COLUMNS_KEY, TABLE_COLUMNS.join(','))),
  );
  const [isColumnsModalOpen, setIsColumnsModalOpen] = useState(false);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const serialized = TABLE_COLUMNS.filter((column) => visibleColumns.has(column)).join(',');
      window.localStorage.setItem(VISIBLE_COLUMNS_KEY, serialized);
    } catch {
      // localStorage may be unavailable; ignore persistence.
    }
  }, [visibleColumns]);

  useEffect(() => {
    if (openColumnsSignal > 0) {
      setIsColumnsModalOpen(true);
    }
  }, [openColumnsSignal]);

  const toggleColumnVisibility = (column: PaceColumnId) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(column)) {
        if (next.size === 1) return prev;
        next.delete(column);
      } else {
        next.add(column);
      }
      return next;
    });
  };

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
          <thead className="bg-surface2/50 text-center text-xs uppercase tracking-wide text-muted">
            <tr>
              {visibleColumns.has('name') ? <th className="px-3 py-2 font-semibold">Name</th> : null}
              {visibleColumns.has('currentPace') ? (
                <th className="px-3 py-2 font-semibold">Current pace</th>
              ) : null}
              {visibleColumns.has('paceMargin') ? (
                <th className="px-3 py-2 font-semibold">Pace margin</th>
              ) : null}
              {visibleColumns.has('currentPaceEnd') ? (
                <th className="px-3 py-2 font-semibold">{COLUMN_LABELS.currentPaceEnd}</th>
              ) : null}
              {visibleColumns.has('buffer') ? <th className="px-3 py-2 font-semibold">Buffer</th> : null}
              {visibleColumns.has('bufferModifierGoal') ? (
                <th className="px-3 py-2 font-semibold">{COLUMN_LABELS.bufferModifierGoal}</th>
              ) : null}
              {visibleColumns.has('paceToGoal') ? (
                <th className="px-3 py-2 font-semibold">{COLUMN_LABELS.paceToGoal}</th>
              ) : null}
              {visibleColumns.has('setPace') ? (
                <th className="px-3 py-2 font-semibold">Set pace</th>
              ) : null}
              {visibleColumns.has('rebalance') ? (
                <th className="px-3 py-2 font-semibold">Rebalance</th>
              ) : null}
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
                visibleColumns={visibleColumns}
                viewAllMode={viewAllMode}
              />
            ))}
          </tbody>
        </table>
      </div>
      <ModalShell
        open={isColumnsModalOpen}
        title="Visible columns"
        onClose={() => setIsColumnsModalOpen(false)}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Choose which columns are visible in the pace table.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TABLE_COLUMNS.map((column) => (
              <label
                key={column}
                className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border/70 bg-surface2/40 px-3 py-2 text-sm text-fg"
              >
                <input
                  type="checkbox"
                  checked={visibleColumns.has(column)}
                  onChange={() => toggleColumnVisibility(column)}
                />
                {COLUMN_LABELS[column]}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted">At least one column must stay visible.</p>
        </div>
      </ModalShell>
    </div>
  );
}
