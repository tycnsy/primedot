import { useEffect, useMemo, useState } from 'react';
import ModalShell from './goals/ModalShell';
import type { Project, Task } from '../lib/types';
import type { ComplexSubtaskDraft } from '../hooks/useTasks';
import { formatHMS } from '../lib/time';

interface Props {
  open: boolean;
  parent: Task | null;
  project: Project;
  existingSubtasks: Task[];
  onClose: () => void;
  onSave: (drafts: ComplexSubtaskDraft[]) => Promise<void> | void;
  /**
   * When opening on a regular scaling task (no `complex_mode` yet), the modal
   * acts as "Convert to Complex Task" and the save handler should create the
   * complex hierarchy rather than diff existing subtasks.
   */
  mode: 'convert' | 'edit';
}

interface EditableRow {
  id?: string;
  name: string;
  scaling_modifier: string;
}

function rowsFromSubtasks(subtasks: Task[]): EditableRow[] {
  if (subtasks.length === 0) {
    return [
      { name: '', scaling_modifier: '' },
      { name: '', scaling_modifier: '' },
    ];
  }
  return subtasks.map((s) => ({
    id: s.id,
    name: s.name,
    scaling_modifier:
      s.scaling_modifier != null ? String(s.scaling_modifier) : '',
  }));
}

export default function ComplexTaskSettingsModal({
  open,
  parent,
  project,
  existingSubtasks,
  onClose,
  onSave,
  mode,
}: Props) {
  const [rows, setRows] = useState<EditableRow[]>(() =>
    rowsFromSubtasks(existingSubtasks),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRows(rowsFromSubtasks(existingSubtasks));
    setError(null);
  }, [open, existingSubtasks]);

  const summary = useMemo(() => {
    const sum = rows.reduce((acc, r) => {
      const n = Number.parseFloat(r.scaling_modifier);
      return Number.isFinite(n) && n > 0 ? acc + n : acc;
    }, 0);
    const buffer = Number.isFinite(project.buffer_modifier)
      ? project.buffer_modifier
      : 1;
    const length = project.video_length * sum * buffer;
    return { sum, length };
  }, [rows, project.buffer_modifier, project.video_length]);

  const updateRow = (index: number, patch: Partial<EditableRow>) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
    setError(null);
  };

  const addRow = () => {
    setRows((prev) => [...prev, { name: '', scaling_modifier: '' }]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  };

  const submit = async () => {
    setError(null);

    if (rows.length < 2) {
      setError('A complex task needs at least 2 subtasks.');
      return;
    }

    const drafts: ComplexSubtaskDraft[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const name = r.name.trim();
      if (!name) {
        setError(`Subtask ${i + 1} needs a name.`);
        return;
      }
      const mod = Number.parseFloat(r.scaling_modifier);
      if (!Number.isFinite(mod) || mod <= 0) {
        setError(`Subtask ${i + 1} needs a scaling modifier > 0.`);
        return;
      }
      drafts.push({ id: r.id, name, scaling_modifier: mod });
    }

    setBusy(true);
    try {
      await onSave(drafts);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!parent) return null;

  const title =
    mode === 'convert' ? 'Convert to Complex Task' : 'Complex Task Subtasks';

  return (
    <ModalShell
      open={open}
      title={title}
      onClose={onClose}
      maxWidthClassName="max-w-[640px]"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void submit();
            }}
            disabled={busy}
            className="btn-primary"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {mode === 'convert'
            ? `Split "${parent.name}" into multiple scaling subtasks. Each subtask
               is its own scaling task while expanded.`
            : `Edit the subtasks for "${parent.name}". Removing a subtask
               deletes its progress.`}
        </p>

        <div className="space-y-2">
          {rows.map((row, index) => (
            <div
              key={row.id ?? `new-${index}`}
              className="grid grid-cols-12 gap-2 items-start"
            >
              <div className="col-span-7 space-y-1">
                <label className="label">Name</label>
                <input
                  className="input"
                  value={row.name}
                  onChange={(e) => updateRow(index, { name: e.target.value })}
                  placeholder={`Subtask ${index + 1}`}
                />
              </div>
              <div className="col-span-3 space-y-1">
                <label className="label">Modifier</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className="input"
                  value={row.scaling_modifier}
                  onChange={(e) =>
                    updateRow(index, { scaling_modifier: e.target.value })
                  }
                  placeholder="2"
                />
              </div>
              <div className="col-span-2 flex justify-end pt-[26px]">
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="btn-ghost"
                  disabled={rows.length <= 2}
                  title={
                    rows.length <= 2
                      ? 'A complex task needs at least 2 subtasks.'
                      : 'Remove subtask'
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <button type="button" onClick={addRow} className="btn-secondary">
          + Add subtask
        </button>

        <div className="rounded-md border border-border bg-surface2/40 p-3 text-xs text-muted space-y-1">
          <div>
            Rolled-up modifier:{' '}
            <span className="font-sans tabular-nums text-fg">
              ×{summary.sum.toFixed(2)}
            </span>
          </div>
          <div>
            Compressed task length:{' '}
            <span className="font-sans tabular-nums text-fg">
              {formatHMS(Math.round(summary.length))}
            </span>{' '}
            (video_length × sum × buffer)
          </div>
        </div>

        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    </ModalShell>
  );
}
