import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Task, TaskInput, TaskType } from '../lib/types';
import { formatHMS, parseHMS } from '../lib/time';

interface Props {
  projectId: string;
  initial?: Task | null;
  onSubmit: (input: TaskInput) => Promise<void> | void;
  onCancel?: () => void;
  onDelete?: () => Promise<void> | void;
  submitLabel?: string;
}

interface FieldsState {
  scaling_modifier: string;
  scripting_modifier: string;
  script_length_hms: string;
  unit_count: string;
  unit_length_seconds: string;
  manual_length_hms: string;
}

function defaults(initial?: Task | null): FieldsState {
  return {
    scaling_modifier:
      initial?.scaling_modifier != null ? String(initial.scaling_modifier) : '',
    scripting_modifier:
      initial?.scripting_modifier != null
        ? String(initial.scripting_modifier)
        : '',
    script_length_hms:
      initial?.script_length != null ? formatHMS(initial.script_length) : '',
    unit_count: initial?.unit_count != null ? String(initial.unit_count) : '',
    unit_length_seconds:
      initial?.unit_length != null ? String(initial.unit_length) : '',
    manual_length_hms:
      initial?.manual_length != null ? formatHMS(initial.manual_length) : '',
  };
}

export default function TaskForm({
  projectId,
  initial,
  onSubmit,
  onCancel,
  onDelete,
  submitLabel = 'Save',
}: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<TaskType>(initial?.type ?? 'scaling');
  const [status, setStatus] = useState<Task['status']>(
    initial?.status ?? 'not_started',
  );
  const [currentProgressStr, setCurrentProgressStr] = useState<string>(() => {
    if (!initial) return type === 'custom' ? '0' : '00:00:00';
    return initial.type === 'custom'
      ? String(initial.current_progress)
      : formatHMS(initial.current_progress);
  });
  const [fields, setFields] = useState<FieldsState>(() => defaults(initial));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initial) return;
    setCurrentProgressStr(type === 'custom' ? '0' : '00:00:00');
  }, [type, initial]);

  const update = <K extends keyof FieldsState>(k: K, v: string) =>
    setFields((s) => ({ ...s, [k]: v }));

  const helpText = useMemo(() => {
    switch (type) {
      case 'scaling':
        return 'scaling_modifier = real minutes per 1 minute of finished video.';
      case 'scripting':
        return 'scripting_modifier = real minutes per 1 minute of script.';
      case 'custom':
        return 'unit_length is real seconds per 1 unit (e.g. one recorded line).';
      case 'manual':
        return 'manual_length is your flat estimate of total real time, before buffer.';
    }
  }, [type]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Task name is required.');

    let current_progress = 0;
    if (type === 'custom') {
      const n = Number.parseInt(currentProgressStr, 10);
      if (!Number.isFinite(n) || n < 0)
        return setError('Current progress must be a whole number.');
      current_progress = n;
    } else {
      const sec = parseHMS(currentProgressStr);
      if (sec == null) return setError('Current progress must be hh:mm:ss.');
      current_progress = sec;
    }

    const input: TaskInput = {
      project_id: projectId,
      name: name.trim(),
      status,
      type,
      current_progress,
      scaling_modifier: null,
      scripting_modifier: null,
      script_length: null,
      unit_count: null,
      unit_length: null,
      manual_length: null,
    };

    if (type === 'scaling') {
      const v = Number.parseFloat(fields.scaling_modifier);
      if (!Number.isFinite(v) || v <= 0)
        return setError('Scaling modifier must be > 0.');
      input.scaling_modifier = v;
    } else if (type === 'scripting') {
      const v = Number.parseFloat(fields.scripting_modifier);
      if (!Number.isFinite(v) || v <= 0)
        return setError('Scripting modifier must be > 0.');
      const len = parseHMS(fields.script_length_hms);
      if (len == null) return setError('Script length must be hh:mm:ss.');
      input.scripting_modifier = v;
      input.script_length = len;
    } else if (type === 'custom') {
      const count = Number.parseInt(fields.unit_count, 10);
      const ulen = Number.parseInt(fields.unit_length_seconds, 10);
      if (!Number.isFinite(count) || count <= 0)
        return setError('Unit count must be a positive whole number.');
      if (!Number.isFinite(ulen) || ulen <= 0)
        return setError('Unit length must be a positive whole number of seconds.');
      input.unit_count = count;
      input.unit_length = ulen;
    } else {
      const len = parseHMS(fields.manual_length_hms);
      if (len == null) return setError('Manual length must be hh:mm:ss.');
      input.manual_length = len;
    }

    setBusy(true);
    try {
      await onSubmit(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <label className="label">Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1">
          <label className="label">Type</label>
          <select
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value as TaskType)}
          >
            <option value="scaling">scaling</option>
            <option value="scripting">scripting</option>
            <option value="custom">custom</option>
            <option value="manual">manual</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="label">Status</label>
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value as Task['status'])}
          >
            <option value="not_started">not_started</option>
            <option value="in_progress">in_progress</option>
            <option value="complete">complete</option>
          </select>
        </div>

        {type === 'scaling' && (
          <div className="space-y-1 sm:col-span-2">
            <label className="label">Scaling modifier</label>
            <input
              type="number"
              step="0.1"
              min="0"
              className="input"
              value={fields.scaling_modifier}
              onChange={(e) => update('scaling_modifier', e.target.value)}
              placeholder="e.g. 5"
            />
          </div>
        )}

        {type === 'scripting' && (
          <>
            <div className="space-y-1">
              <label className="label">Scripting modifier</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="input"
                value={fields.scripting_modifier}
                onChange={(e) => update('scripting_modifier', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="label">Script length (hh:mm:ss)</label>
              <input
                className="input font-sans"
                value={fields.script_length_hms}
                onChange={(e) => update('script_length_hms', e.target.value)}
                placeholder="00:10:00"
              />
            </div>
          </>
        )}

        {type === 'custom' && (
          <>
            <div className="space-y-1">
              <label className="label">Unit count</label>
              <input
                type="number"
                min="1"
                className="input"
                value={fields.unit_count}
                onChange={(e) => update('unit_count', e.target.value)}
                placeholder="100"
              />
            </div>
            <div className="space-y-1">
              <label className="label">Unit length (seconds)</label>
              <input
                type="number"
                min="1"
                className="input"
                value={fields.unit_length_seconds}
                onChange={(e) => update('unit_length_seconds', e.target.value)}
                placeholder="30"
              />
            </div>
          </>
        )}

        {type === 'manual' && (
          <div className="space-y-1 sm:col-span-2">
            <label className="label">Manual length (hh:mm:ss)</label>
            <input
              className="input font-sans"
              value={fields.manual_length_hms}
              onChange={(e) => update('manual_length_hms', e.target.value)}
              placeholder="01:00:00"
            />
          </div>
        )}

        <div className="space-y-1 sm:col-span-2">
          <label className="label">
            Current progress {type === 'custom' ? '(units)' : '(hh:mm:ss)'}
          </label>
          <input
            className={`input ${type === 'custom' ? '' : 'font-sans'}`}
            value={currentProgressStr}
            onChange={(e) => setCurrentProgressStr(e.target.value)}
          />
        </div>
      </div>

      <p className="text-xs text-subtle">{helpText}</p>
      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <button type="button" onClick={onCancel} className="btn-ghost">
            Cancel
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={() => {
              void onDelete();
            }}
            className="btn-danger"
          >
            Delete
          </button>
        ) : null}
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
