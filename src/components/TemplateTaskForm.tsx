import { useMemo, useState, type FormEvent } from 'react';
import type { TemplateTask, TaskType } from '../lib/types';
import { formatHMS, parseHMS } from '../lib/time';

export interface TemplateTaskFormInput {
  name: string;
  type: TaskType;
  scaling_modifier: number | null;
  scripting_modifier: number | null;
  script_length: number | null;
  unit_count: number | null;
  unit_length: number | null;
  manual_length: number | null;
}

interface Props {
  initial?: TemplateTask | null;
  onSubmit: (input: TemplateTaskFormInput) => Promise<void> | void;
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

function defaults(initial?: TemplateTask | null): FieldsState {
  return {
    scaling_modifier:
      initial?.scaling_modifier != null ? String(initial.scaling_modifier) : '',
    scripting_modifier:
      initial?.scripting_modifier != null ? String(initial.scripting_modifier) : '',
    script_length_hms:
      initial?.script_length != null ? formatHMS(initial.script_length) : '',
    unit_count: initial?.unit_count != null ? String(initial.unit_count) : '',
    unit_length_seconds:
      initial?.unit_length != null ? String(initial.unit_length) : '',
    manual_length_hms:
      initial?.manual_length != null ? formatHMS(initial.manual_length) : '',
  };
}

export default function TemplateTaskForm({
  initial,
  onSubmit,
  onCancel,
  onDelete,
  submitLabel = 'Save',
}: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<TaskType>(initial?.type ?? 'scaling');
  const [fields, setFields] = useState<FieldsState>(() => defaults(initial));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = <K extends keyof FieldsState>(k: K, v: string) =>
    setFields((s) => ({ ...s, [k]: v }));

  const helpText = useMemo(() => {
    switch (type) {
      case 'scaling':
        return 'scaling_modifier = real minutes per 1 minute of finished video.';
      case 'scripting':
        return 'scripting_modifier = real minutes per 1 minute of script.';
      case 'custom':
        return 'unit_length is real seconds per 1 unit.';
      case 'manual':
        return 'manual_length is your flat estimate of total real time.';
    }
  }, [type]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Task name is required.');

    const input: TemplateTaskFormInput = {
      name: name.trim(),
      type,
      scaling_modifier: null,
      scripting_modifier: null,
      script_length: null,
      unit_count: null,
      unit_length: null,
      manual_length: null,
    };

    if (type === 'scaling') {
      const value = Number.parseFloat(fields.scaling_modifier);
      if (!Number.isFinite(value) || value <= 0) {
        return setError('Scaling modifier must be > 0.');
      }
      input.scaling_modifier = value;
    } else if (type === 'scripting') {
      const value = Number.parseFloat(fields.scripting_modifier);
      if (!Number.isFinite(value) || value <= 0) {
        return setError('Scripting modifier must be > 0.');
      }
      const scriptLength = parseHMS(fields.script_length_hms);
      if (scriptLength == null) return setError('Script length must be hh:mm:ss.');
      input.scripting_modifier = value;
      input.script_length = scriptLength;
    } else if (type === 'custom') {
      const unitCount = Number.parseInt(fields.unit_count, 10);
      const unitLength = Number.parseInt(fields.unit_length_seconds, 10);
      if (!Number.isFinite(unitCount) || unitCount <= 0) {
        return setError('Unit count must be a positive whole number.');
      }
      if (!Number.isFinite(unitLength) || unitLength <= 0) {
        return setError('Unit length must be a positive whole number of seconds.');
      }
      input.unit_count = unitCount;
      input.unit_length = unitLength;
    } else {
      const manualLength = parseHMS(fields.manual_length_hms);
      if (manualLength == null) return setError('Manual length must be hh:mm:ss.');
      input.manual_length = manualLength;
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
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>

        <div className="space-y-1">
          <label className="label">Type</label>
          <select
            className="input"
            value={type}
            onChange={(event) => setType(event.target.value as TaskType)}
          >
            <option value="scaling">scaling</option>
            <option value="scripting">scripting</option>
            <option value="custom">custom</option>
            <option value="manual">manual</option>
          </select>
        </div>

        {type === 'scaling' ? (
          <div className="space-y-1 sm:col-span-2">
            <label className="label">Scaling modifier</label>
            <input
              type="number"
              step="0.1"
              min="0"
              className="input"
              value={fields.scaling_modifier}
              onChange={(event) => update('scaling_modifier', event.target.value)}
              placeholder="e.g. 5"
            />
          </div>
        ) : null}

        {type === 'scripting' ? (
          <>
            <div className="space-y-1">
              <label className="label">Scripting modifier</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="input"
                value={fields.scripting_modifier}
                onChange={(event) => update('scripting_modifier', event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="label">Script length (hh:mm:ss)</label>
              <input
                className="input font-sans"
                value={fields.script_length_hms}
                onChange={(event) => update('script_length_hms', event.target.value)}
                placeholder="00:10:00"
              />
            </div>
          </>
        ) : null}

        {type === 'custom' ? (
          <>
            <div className="space-y-1">
              <label className="label">Unit count</label>
              <input
                type="number"
                min="1"
                className="input"
                value={fields.unit_count}
                onChange={(event) => update('unit_count', event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="label">Unit length (seconds)</label>
              <input
                type="number"
                min="1"
                className="input"
                value={fields.unit_length_seconds}
                onChange={(event) => update('unit_length_seconds', event.target.value)}
              />
            </div>
          </>
        ) : null}

        {type === 'manual' ? (
          <div className="space-y-1 sm:col-span-2">
            <label className="label">Manual length (hh:mm:ss)</label>
            <input
              className="input font-sans"
              value={fields.manual_length_hms}
              onChange={(event) => update('manual_length_hms', event.target.value)}
              placeholder="01:00:00"
            />
          </div>
        ) : null}
      </div>

      <p className="text-xs text-subtle">{helpText}</p>
      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <div className="flex flex-wrap justify-end gap-2">
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
