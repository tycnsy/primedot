import { useEffect, useState } from 'react';
import ModalShell from '../goals/ModalShell';
import { formatMoney } from '../../features/budget';
import type { SavingsGoal } from '../../features/budget';

interface ContributeModalProps {
  open: boolean;
  goal: SavingsGoal | null;
  currency: string;
  onClose: () => void;
  onSave: (amount: number) => void;
}

export default function ContributeModal({
  open,
  goal,
  currency,
  onClose,
  onSave,
}: ContributeModalProps) {
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (!open) return;
    setAmount('');
  }, [open]);

  const numericAmount = Number(amount);
  const canSave = Number.isFinite(numericAmount) && numericAmount > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave(numericAmount);
    onClose();
  };

  return (
    <ModalShell
      open={open}
      title={`Contribute${goal ? ` · ${goal.name}` : ''}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={!canSave} onClick={handleSave}>
            Add contribution
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {goal ? (
          <p className="text-sm text-muted">
            Saved so far:{' '}
            <span className="font-medium text-fg tabular-nums">
              {formatMoney(goal.contributedAmount, currency)}
            </span>{' '}
            of {formatMoney(goal.targetAmount, currency)}
          </p>
        ) : null}
        <div className="space-y-1.5">
          <label className="label">Contribution amount</label>
          <input
            className="input"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            autoFocus
          />
          {goal?.linkedAccountId ? (
            <p className="text-xs text-muted">
              A matching deposit will be logged to the linked account.
            </p>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}
