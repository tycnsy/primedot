import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import {
  useDeleteRealtimeLog,
  useRealtimeLogs,
  useUpdateRealtimeLog,
} from '../../hooks/useRealtimeLogs';
import {
  changeKindLabel,
  groupLogsByLocalDay,
} from '../../lib/heatmap';
import { formatHMS } from '../../lib/time';
import type { RealtimeLog } from '../../lib/types';

const LIMIT_OPTIONS = [50, 100, 250, 500] as const;

interface RealtimeLogsTabProps {
  projectId?: string;
  limit: number;
  onLimitChange: (limit: number) => void;
}

function formatValue(value: string | null): string {
  if (value == null || value === '') return '—';
  return value;
}

function EditLogModal({
  log,
  onClose,
  onSave,
  saving,
}: {
  log: RealtimeLog;
  onClose: () => void;
  onSave: (patch: { realtime_delta_seconds: number; new_value: string | null }) => void;
  saving: boolean;
}) {
  const [deltaInput, setDeltaInput] = useState(String(log.realtime_delta_seconds));
  const [newValueInput, setNewValueInput] = useState(log.new_value ?? '');

  useEffect(() => {
    setDeltaInput(String(log.realtime_delta_seconds));
    setNewValueInput(log.new_value ?? '');
  }, [log]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-md space-y-4">
        <h3 className="text-base font-semibold text-fg">Edit log entry</h3>
        <p className="text-sm text-muted">
          {changeKindLabel(log.change_kind)} · {log.project_name}
          {log.task_name ? ` · ${log.task_name}` : ''}
        </p>
        <div className="space-y-1">
          <label className="label" htmlFor="log-delta">
            Realtime delta (seconds)
          </label>
          <input
            id="log-delta"
            className="input"
            type="number"
            step="any"
            value={deltaInput}
            onChange={(e) => setDeltaInput(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="label" htmlFor="log-new-value">
            New value
          </label>
          <input
            id="log-new-value"
            className="input"
            value={newValueInput}
            onChange={(e) => setNewValueInput(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={saving}
            onClick={() => {
              const parsed = Number(deltaInput);
              if (!Number.isFinite(parsed)) return;
              onSave({
                realtime_delta_seconds: parsed,
                new_value: newValueInput.trim().length > 0 ? newValueInput : null,
              });
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RealtimeLogsTab({
  projectId,
  limit,
  onLimitChange,
}: RealtimeLogsTabProps) {
  const deleteLog = useDeleteRealtimeLog();
  const updateLog = useUpdateRealtimeLog();
  const [editingLog, setEditingLog] = useState<RealtimeLog | null>(null);
  const [progressOnly, setProgressOnly] = useState(false);

  const logsQuery = useRealtimeLogs({ projectId, limit, progressOnly });
  const logs = logsQuery.data ?? [];
  const groups = useMemo(() => groupLogsByLocalDay(logs), [logs]);

  if (logsQuery.isLoading) return <p className="text-muted">Loading logs…</p>;
  if (logsQuery.error) return <p className="text-danger">{logsQuery.error.message}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Showing up to {limit} most recent entries, grouped by day.
          {progressOnly ? ' Progress changes only.' : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-sm"
            data-active={progressOnly}
            aria-pressed={progressOnly}
            onClick={() => setProgressOnly((v) => !v)}
          >
            Progress only
          </button>
          <label className="flex items-center gap-2 text-sm text-muted">
            View limit
            <select
              className="input py-1"
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
            >
              {LIMIT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-muted">
          {progressOnly ? 'No progress logged yet.' : 'No activity logged yet.'}
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.dateKey} className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-fg">
                  {format(group.date, 'EEEE, MMM d, yyyy')}
                </h3>
                <span className="text-xs text-muted tabular-nums">
                  Day total: {formatHMS(Math.round(group.dayTotalSeconds))} realtime
                </span>
              </div>
              <ul className="divide-y divide-border/60 rounded-lg border border-border/70 bg-surface/50">
                {group.logs.map((log) => (
                  <li
                    key={log.id}
                    className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-fg">
                          {changeKindLabel(log.change_kind)}
                        </span>
                        {log.realtime_delta_seconds !== 0 ? (
                          <span
                            className={`pill tabular-nums ${
                              log.realtime_delta_seconds < 0
                                ? 'text-danger'
                                : 'text-success'
                            }`}
                          >
                            {log.realtime_delta_seconds > 0 ? '+' : ''}
                            {formatHMS(Math.round(log.realtime_delta_seconds))}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-muted">
                        {log.project_name}
                        {log.task_name ? ` · ${log.task_name}` : ''}
                        {log.task_type ? ` (${log.task_type})` : ''}
                      </p>
                      <p className="text-xs text-muted">
                        {formatValue(log.old_value)} → {formatValue(log.new_value)}
                      </p>
                      <p className="text-[11px] text-muted">
                        {format(new Date(log.logged_at), 'h:mm:ss a')}
                        {log.project_tag ? ` · tag ${log.project_tag}` : ''}
                        {log.project_series ? ` · series ${log.project_series}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className="btn-ghost px-2 py-1 text-xs"
                        onClick={() => setEditingLog(log)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-ghost px-2 py-1 text-xs text-danger"
                        disabled={deleteLog.isPending}
                        onClick={async () => {
                          if (!confirm('Remove this log entry?')) return;
                          await deleteLog.mutateAsync(log.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editingLog ? (
        <EditLogModal
          log={editingLog}
          onClose={() => setEditingLog(null)}
          saving={updateLog.isPending}
          onSave={async (patch) => {
            await updateLog.mutateAsync({ id: editingLog.id, patch });
            setEditingLog(null);
          }}
        />
      ) : null}
    </div>
  );
}
