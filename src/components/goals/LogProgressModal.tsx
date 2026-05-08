import { useEffect, useMemo, useState } from 'react';
import type { LongGoal } from '../../features/goals';
import ModalShell from './ModalShell';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface LogProgressPayload {
  goalId: string;
  at: string;
  value?: number;
  note?: string;
}

interface LogProgressModalProps {
  open: boolean;
  goal: LongGoal | null;
  onClose: () => void;
  onSave: (payload: LogProgressPayload) => void;
}

export default function LogProgressModal({
  open,
  goal,
  onClose,
  onSave,
}: LogProgressModalProps) {
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayIsoDate());
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open || !goal) return;
    setValue('');
    setDate(todayIsoDate());
    setNote('');
  }, [goal, open]);

  const isMilestone = goal?.type === 'milestone';

  const valueLabel = useMemo(() => {
    if (!goal || isMilestone) return '';
    if (goal.type === 'trend') return `Current value (${goal.unit})`;
    return `Amount to add (${goal.unit})`;
  }, [goal, isMilestone]);

  if (!goal) return null;

  const handleSave = () => {
    if (!isMilestone) {
      const parsed = Number(value);
      if (Number.isNaN(parsed)) return;
      onSave({
        goalId: goal.id,
        at: new Date(`${date}T12:00:00`).toISOString(),
        value: parsed,
        note: note.trim() || undefined,
      });
    } else {
      onSave({
        goalId: goal.id,
        at: new Date(`${date}T12:00:00`).toISOString(),
        note: note.trim() || undefined,
      });
    }
    onClose();
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={`Log progress · ${goal.name}`}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="button" onClick={handleSave} className="btn-primary">
            Save entry
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {!isMilestone ? (
          <div className="space-y-1">
            <label htmlFor="log-value" className="label">
              {valueLabel}
            </label>
            <input
              id="log-value"
              type="number"
              step="any"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="input text-lg tabular-nums"
              autoFocus
            />
          </div>
        ) : null}

        <div className="space-y-1">
          <label htmlFor="log-date" className="label">
            Date
          </label>
          <input
            id="log-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="input"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="log-note" className="label">
            Note
          </label>
          <textarea
            id="log-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="input min-h-[90px] resize-y py-2"
            placeholder={
              goal.type === 'trend'
                ? 'Notes show up as dots on the chart - hover to read them later.'
                : 'Add optional context for this entry...'
            }
          />
        </div>
      </div>
    </ModalShell>
  );
}
