import { useEffect, useState } from 'react';
import ModalShell from '../goals/ModalShell';
import type { Account, NewSavingsGoalInput, SavingsGoal } from '../../features/budget';

interface AddSavingsGoalModalProps {
  open: boolean;
  goal?: SavingsGoal | null;
  accounts: Account[];
  onClose: () => void;
  onSave: (input: NewSavingsGoalInput) => void;
}

export default function AddSavingsGoalModal({
  open,
  goal,
  accounts,
  onClose,
  onSave,
}: AddSavingsGoalModalProps) {
  const isEdit = !!goal;
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [linkedAccountId, setLinkedAccountId] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(goal?.name ?? '');
    setTargetAmount(goal?.targetAmount != null ? String(goal.targetAmount) : '');
    setTargetDate(goal?.targetDate ?? '');
    setLinkedAccountId(goal?.linkedAccountId ?? '');
  }, [goal, open]);

  const numericTarget = Number(targetAmount);
  const canSave = name.trim() !== '' && Number.isFinite(numericTarget) && numericTarget > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      targetAmount: numericTarget,
      targetDate: targetDate || undefined,
      linkedAccountId: linkedAccountId || undefined,
    });
    onClose();
  };

  return (
    <ModalShell
      open={open}
      title={isEdit ? 'Edit savings goal' : 'New savings goal'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={!canSave} onClick={handleSave}>
            {isEdit ? 'Save' : 'Create'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="label">Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Emergency fund"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="label">Target amount</label>
            <input
              className="input"
              inputMode="decimal"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="5000"
            />
          </div>
          <div className="space-y-1.5">
            <label className="label">Target date</label>
            <input
              type="date"
              className="input"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="label">Linked account (optional)</label>
          <select
            className="input"
            value={linkedAccountId}
            onChange={(e) => setLinkedAccountId(e.target.value)}
          >
            <option value="">None</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </ModalShell>
  );
}
