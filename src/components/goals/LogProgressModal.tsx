import { useEffect, useMemo, useState } from 'react';
import type { LongGoal } from '../../features/goals';
import ModalShell from './ModalShell';

function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export interface LogProgressPayload {
  goalId: string;
  at: string;
  value?: number;
  note?: string;
  kind?: 'total' | 'adjustment';
  delta?: number;
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
  const [dateTime, setDateTime] = useState(todayIsoDate());
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'total' | 'adjustment'>('adjustment');

  useEffect(() => {
    if (!open || !goal) return;
    setValue('');
    setDateTime(todayIsoDate());
    setNote('');
    setMode('adjustment');
  }, [goal, open]);

  const isMilestone = goal?.type === 'milestone';
  const isTrend = goal?.type === 'trend';

  const trendBaseValue = useMemo(() => {
    if (!goal || goal.type !== 'trend') return undefined;
    const latest = [...goal.logs]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .find((log) => typeof log.value === 'number');
    return latest?.value ?? goal.startValue;
  }, [goal]);

  const valueLabel = useMemo(() => {
    if (!goal || isMilestone) return '';
    if (goal.type === 'trend') {
      return mode === 'adjustment'
        ? `Adjustment (+/- ${goal.unit})`
        : `Current value (${goal.unit})`;
    }
    return `Amount to add (${goal.unit})`;
  }, [goal, isMilestone, mode]);

  if (!goal) return null;

  const handleSave = () => {
    const parsedDate = new Date(dateTime);
    if (Number.isNaN(parsedDate.getTime())) return;

    if (!isMilestone) {
      const parsed = Number(value);
      if (Number.isNaN(parsed)) return;
      if (isTrend && mode === 'adjustment') {
        if (typeof trendBaseValue !== 'number') return;
        onSave({
          goalId: goal.id,
          at: parsedDate.toISOString(),
          value: trendBaseValue + parsed,
          note: note.trim() || undefined,
          kind: 'adjustment',
          delta: parsed,
        });
        onClose();
        return;
      }
      onSave({
        goalId: goal.id,
        at: parsedDate.toISOString(),
        value: parsed,
        note: note.trim() || undefined,
        kind: isTrend ? 'total' : undefined,
      });
    } else {
      onSave({
        goalId: goal.id,
        at: parsedDate.toISOString(),
        note: note.trim() || undefined,
      });
    }
    onClose();
  };

  const parsedValue = Number(value);
  const hasParsedValue = value.trim().length > 0 && !Number.isNaN(parsedValue);
  const adjustmentPreviewValue =
    isTrend && mode === 'adjustment' && typeof trendBaseValue === 'number'
      ? trendBaseValue + (hasParsedValue ? parsedValue : 0)
      : null;

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
        {isTrend ? (
          <div className="space-y-1">
            <span className="label">Entry type</span>
            <div className="segmented w-fit">
              <button type="button" data-active={mode === 'total'} onClick={() => setMode('total')}>
                Total
              </button>
              <button
                type="button"
                data-active={mode === 'adjustment'}
                onClick={() => setMode('adjustment')}
              >
                Adjustment
              </button>
            </div>
          </div>
        ) : null}

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
            {adjustmentPreviewValue !== null ? (
              <p className="text-xs text-muted">
                New total will be {adjustmentPreviewValue.toLocaleString()} {goal.unit}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-1">
          <label htmlFor="log-date-time" className="label">
            Date &amp; time
          </label>
          <input
            id="log-date-time"
            type="datetime-local"
            value={dateTime}
            onChange={(event) => setDateTime(event.target.value)}
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
