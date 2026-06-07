import { useEffect, useState } from 'react';
import ModalShell from '../goals/ModalShell';
import type { Account, AccountType, NewAccountInput } from '../../features/budget';

interface AddAccountModalProps {
  open: boolean;
  account?: Account | null;
  onClose: () => void;
  onSave: (input: NewAccountInput) => void;
}

const TYPES: { value: AccountType; label: string }[] = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit', label: 'Credit' },
];

function toNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function AddAccountModal({
  open,
  account,
  onClose,
  onSave,
}: AddAccountModalProps) {
  const isEdit = !!account;
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [creditLimit, setCreditLimit] = useState('');
  const [apr, setApr] = useState('');
  const [minimumPayment, setMinimumPayment] = useState('');
  const [payoffTargetDate, setPayoffTargetDate] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? '');
    setType(account?.type ?? 'checking');
    setCreditLimit(account?.creditLimit != null ? String(account.creditLimit) : '');
    setApr(account?.apr != null ? String(account.apr) : '');
    setMinimumPayment(account?.minimumPayment != null ? String(account.minimumPayment) : '');
    setPayoffTargetDate(account?.payoffTargetDate ?? '');
    setOpeningBalance('');
  }, [account, open]);

  const canSave = name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      type,
      creditLimit: type === 'credit' ? toNumber(creditLimit) : undefined,
      apr: type === 'credit' ? toNumber(apr) : undefined,
      minimumPayment: type === 'credit' ? toNumber(minimumPayment) : undefined,
      payoffTargetDate: type === 'credit' && payoffTargetDate ? payoffTargetDate : undefined,
      openingBalance: isEdit ? undefined : toNumber(openingBalance),
    });
    onClose();
  };

  return (
    <ModalShell
      open={open}
      title={isEdit ? 'Edit account' : 'New account'}
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
            placeholder="e.g. Everyday Checking"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label className="label">Type</label>
          <div className="segmented w-full">
            {TYPES.map((option) => (
              <button
                key={option.value}
                type="button"
                data-active={type === option.value}
                className="flex-1"
                onClick={() => setType(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {type === 'credit' ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="label">Credit limit</label>
              <input
                className="input"
                inputMode="decimal"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                placeholder="5000"
              />
            </div>
            <div className="space-y-1.5">
              <label className="label">APR %</label>
              <input
                className="input"
                inputMode="decimal"
                value={apr}
                onChange={(e) => setApr(e.target.value)}
                placeholder="22.99"
              />
            </div>
            <div className="space-y-1.5">
              <label className="label">Minimum payment</label>
              <input
                className="input"
                inputMode="decimal"
                value={minimumPayment}
                onChange={(e) => setMinimumPayment(e.target.value)}
                placeholder="35"
              />
            </div>
            <div className="space-y-1.5">
              <label className="label">Payoff target</label>
              <input
                type="date"
                className="input"
                value={payoffTargetDate}
                onChange={(e) => setPayoffTargetDate(e.target.value)}
              />
            </div>
          </div>
        ) : null}

        {!isEdit ? (
          <div className="space-y-1.5">
            <label className="label">
              {type === 'credit' ? 'Current balance owed' : 'Opening balance'}
            </label>
            <input
              className="input"
              inputMode="decimal"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              placeholder="0.00"
            />
            <p className="text-xs text-muted">
              Logged as an adjustment so balances stay derived from the transaction log.
            </p>
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}
