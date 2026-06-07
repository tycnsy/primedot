import { useEffect, useState } from 'react';
import ModalShell from '../goals/ModalShell';
import { adjustmentDelta, formatMoney, formatSignedMoney } from '../../features/budget';
import type { Account } from '../../features/budget';

interface BalanceAdjustModalProps {
  open: boolean;
  account: Account | null;
  currentBalance: number;
  currency: string;
  onClose: () => void;
  onSave: (delta: number) => void;
}

export default function BalanceAdjustModal({
  open,
  account,
  currentBalance,
  currency,
  onClose,
  onSave,
}: BalanceAdjustModalProps) {
  const [target, setTarget] = useState('');

  useEffect(() => {
    if (!open) return;
    setTarget(String(currentBalance));
  }, [currentBalance, open]);

  const numericTarget = Number(target);
  const valid = target.trim() !== '' && Number.isFinite(numericTarget);
  const delta = valid ? adjustmentDelta(currentBalance, numericTarget) : 0;

  const handleSave = () => {
    if (!valid || delta === 0) {
      onClose();
      return;
    }
    onSave(delta);
    onClose();
  };

  return (
    <ModalShell
      open={open}
      title={`Adjust balance${account ? ` · ${account.name}` : ''}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={!valid} onClick={handleSave}>
            Log adjustment
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Current derived balance:{' '}
          <span className="font-medium text-fg tabular-nums">
            {formatMoney(currentBalance, currency)}
          </span>
        </p>
        <div className="space-y-1.5">
          <label className="label">
            {account?.type === 'credit' ? 'New balance owed' : 'New balance'}
          </label>
          <input
            className="input"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            autoFocus
          />
        </div>
        {valid && delta !== 0 ? (
          <p className="text-sm text-muted">
            Adjustment entry:{' '}
            <span className="font-medium text-fg tabular-nums">
              {formatSignedMoney(delta, currency)}
            </span>
          </p>
        ) : null}
      </div>
    </ModalShell>
  );
}
