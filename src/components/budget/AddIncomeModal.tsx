import { useEffect, useState } from 'react';
import ModalShell from '../goals/ModalShell';
import type { Account, IncomeEntry, NewIncomeInput } from '../../features/budget';
import { earnedMonthFromInput, earnedMonthToInput, isoDate } from '../../features/budget';

interface AddIncomeModalProps {
  open: boolean;
  entry?: IncomeEntry | null;
  defaultExpectedDate?: string;
  assetAccounts?: Account[];
  onClose: () => void;
  onSave: (input: NewIncomeInput) => void;
  onMarkReceived?: (entry: IncomeEntry, accountId?: string) => void;
}

export default function AddIncomeModal({
  open,
  entry,
  defaultExpectedDate,
  assetAccounts = [],
  onClose,
  onSave,
  onMarkReceived,
}: AddIncomeModalProps) {
  const isEdit = !!entry;
  const [sourceName, setSourceName] = useState('');
  const [amount, setAmount] = useState('');
  const [expectedDate, setExpectedDate] = useState(defaultExpectedDate ?? isoDate(new Date()));
  const [earnedMonthInput, setEarnedMonthInput] = useState('');
  const [depositAccountId, setDepositAccountId] = useState('');
  const [confirmMarkReceived, setConfirmMarkReceived] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSourceName(entry?.sourceName ?? '');
    setAmount(entry?.amount != null ? String(entry.amount) : '');
    const nextExpected = entry?.expectedDate ?? defaultExpectedDate ?? isoDate(new Date());
    setExpectedDate(nextExpected);
    setEarnedMonthInput(
      entry?.earnedMonth
        ? earnedMonthToInput(entry.earnedMonth)
        : nextExpected.slice(0, 7),
    );
    setDepositAccountId(assetAccounts[0]?.id ?? '');
    setConfirmMarkReceived(false);
  }, [assetAccounts, defaultExpectedDate, entry, open]);

  const numericAmount = Number(amount);
  const canSave =
    sourceName.trim() !== '' && Number.isFinite(numericAmount) && numericAmount !== 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      sourceName: sourceName.trim(),
      amount: numericAmount,
      expectedDate,
      earnedMonth: earnedMonthFromInput(earnedMonthInput),
    });
    onClose();
  };

  const handleMarkReceived = () => {
    if (!entry || !onMarkReceived) return;
    if (!confirmMarkReceived) {
      setConfirmMarkReceived(true);
      return;
    }
    onMarkReceived(entry, depositAccountId || undefined);
    onClose();
  };

  const showMarkReceived = isEdit && entry?.status !== 'received' && onMarkReceived;

  return (
    <ModalShell
      open={open}
      title={isEdit ? 'Edit income' : 'Planned income'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={!canSave} onClick={handleSave}>
            {isEdit ? 'Save' : 'Add'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="label">Source</label>
          <input
            className="input"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            placeholder="e.g. Paycheck"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="label">Amount</label>
            <input
              className="input"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <label className="label">Expected date</label>
            <input
              type="date"
              className="input"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="label">Month earned</label>
          <input
            type="month"
            className="input"
            value={earnedMonthInput}
            onChange={(e) => setEarnedMonthInput(e.target.value)}
          />
          <p className="text-xs text-muted">
            When the money was actually earned, which may differ from the payout date.
          </p>
        </div>

        {showMarkReceived ? (
          <div className="space-y-3 rounded-lg border border-border bg-surface2/50 p-3">
            <p className="text-xs text-muted">
              Marking income received logs a confirming deposit to the selected account.
            </p>
            <div className="space-y-1.5">
              <label className="label">Deposit account</label>
              <select
                className="input"
                value={depositAccountId}
                onChange={(e) => setDepositAccountId(e.target.value)}
                disabled={!assetAccounts.length}
              >
                <option value="" disabled>
                  Select deposit account
                </option>
                {assetAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {confirmMarkReceived ? (
                <>
                  <button
                    type="button"
                    className="btn-secondary text-danger"
                    disabled={!assetAccounts.length}
                    onClick={handleMarkReceived}
                  >
                    Confirm received
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    onClick={() => setConfirmMarkReceived(false)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!assetAccounts.length}
                  onClick={handleMarkReceived}
                >
                  Mark received
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}
