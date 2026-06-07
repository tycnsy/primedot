import { useEffect, useState } from 'react';
import ModalShell from '../goals/ModalShell';
import type { MonthlyEarningsSnapshot } from '../../features/budget';

interface EditSnapshotModalProps {
  open: boolean;
  snapshot: MonthlyEarningsSnapshot | null;
  onClose: () => void;
  onSave: (patch: { recordedAt: string; totalAmount: number }) => void;
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}

export default function EditSnapshotModal({
  open,
  snapshot,
  onClose,
  onSave,
}: EditSnapshotModalProps) {
  const [recordedAtInput, setRecordedAtInput] = useState('');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (!open || !snapshot) return;
    setRecordedAtInput(toDatetimeLocalValue(snapshot.recordedAt));
    setAmount(String(snapshot.totalAmount));
  }, [open, snapshot]);

  const numericAmount = Number(amount);
  const canSave =
    recordedAtInput !== '' && Number.isFinite(numericAmount) && numericAmount >= 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      recordedAt: fromDatetimeLocalValue(recordedAtInput),
      totalAmount: numericAmount,
    });
    onClose();
  };

  return (
    <ModalShell
      open={open}
      title="Edit update"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={!canSave} onClick={handleSave}>
            Save
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="label">Date and time</label>
          <input
            type="datetime-local"
            className="input"
            value={recordedAtInput}
            onChange={(e) => setRecordedAtInput(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="label">Total amount</label>
          <input
            className="input"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        {snapshot?.note ? (
          <p className="text-xs text-muted">Note: {snapshot.note}</p>
        ) : null}
      </div>
    </ModalShell>
  );
}
