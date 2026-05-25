import { useEffect, useState } from 'react';
import ModalShell from './goals/ModalShell';
import type { Task } from '../lib/types';
import { formatHMS } from '../lib/time';

interface Props {
  open: boolean;
  parent: Task | null;
  subtasks: Task[];
  onCancel: () => void;
  onConfirm: (chosenProgress: number) => Promise<void> | void;
}

export default function ComplexCollapseConflictModal({
  open,
  parent,
  subtasks,
  onCancel,
  onConfirm,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    subtasks[0]?.id ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedId(subtasks[0]?.id ?? null);
    setError(null);
  }, [open, subtasks]);

  const submit = async () => {
    setError(null);
    const selected = subtasks.find((s) => s.id === selectedId);
    if (!selected) {
      setError('Select a subtask to adopt its progress.');
      return;
    }
    setBusy(true);
    try {
      await onConfirm(selected.current_progress);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Collapse failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!parent) return null;

  return (
    <ModalShell
      open={open}
      title="Choose progress to keep"
      onClose={onCancel}
      maxWidthClassName="max-w-[520px]"
      footer={
        <>
          <button type="button" onClick={onCancel} className="btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void submit();
            }}
            disabled={busy || !selectedId}
            className="btn-primary"
          >
            {busy ? 'Compressing…' : 'Compress'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Your subtasks have different progress values. Pick which one to adopt
          for the compressed task — every subtask will be set to this value.
        </p>

        <div className="space-y-2" role="radiogroup">
          {subtasks.map((sub) => {
            const checked = sub.id === selectedId;
            return (
              <label
                key={sub.id}
                className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                  checked
                    ? 'border-accent/50 bg-accent/10'
                    : 'border-border hover:border-border/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="collapse-source"
                    value={sub.id}
                    checked={checked}
                    onChange={() => setSelectedId(sub.id)}
                  />
                  <span className="text-sm text-fg">{sub.name}</span>
                </div>
                <span className="font-sans tabular-nums text-xs text-muted">
                  {formatHMS(sub.current_progress)}
                </span>
              </label>
            );
          })}
        </div>

        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    </ModalShell>
  );
}
