import { useEffect, useMemo, useState } from 'react';
import ModalShell from '../goals/ModalShell';
import type {
  Account,
  Category,
  NewTransactionInput,
  NewTransferInput,
  Transaction,
  TransactionType,
} from '../../features/budget';
import { isoDate } from '../../features/budget';

interface AddTransactionModalProps {
  open: boolean;
  accounts: Account[];
  categories: Category[];
  transactions?: Transaction[];
  transaction?: Transaction | null;
  defaultAccountId?: string;
  defaultCategoryId?: string;
  onClose: () => void;
  onSave: (input: NewTransactionInput) => void;
  onSaveTransfer?: (input: NewTransferInput) => void;
}

const BASE_TYPES: { value: TransactionType; label: string }[] = [
  { value: 'debit', label: 'Expense' },
  { value: 'credit', label: 'Income' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'transfer', label: 'Transfer' },
];

function resolveTransferAccounts(
  transaction: Transaction,
  transactions: Transaction[],
): { fromAccountId: string; toAccountId: string } {
  const legs = transactions.filter(
    (item) => item.transferGroupId === transaction.transferGroupId,
  );
  const outLeg = legs.find((item) => item.transferLeg === 'out');
  const inLeg = legs.find((item) => item.transferLeg === 'in');
  return {
    fromAccountId: outLeg?.accountId ?? transaction.accountId,
    toAccountId: inLeg?.accountId ?? transaction.accountId,
  };
}

export default function AddTransactionModal({
  open,
  accounts,
  categories,
  transactions = [],
  transaction,
  defaultAccountId,
  defaultCategoryId,
  onClose,
  onSave,
  onSaveTransfer,
}: AddTransactionModalProps) {
  const isEdit = !!transaction;
  const isTransferEdit = transaction?.type === 'transfer';

  const typeOptions = useMemo(() => {
    if (isTransferEdit) return [{ value: 'transfer' as const, label: 'Transfer' }];
    if (isEdit) return BASE_TYPES.filter((option) => option.value !== 'transfer');
    return BASE_TYPES;
  }, [isEdit, isTransferEdit]);

  const [accountId, setAccountId] = useState('');
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [type, setType] = useState<TransactionType>('debit');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(isoDate(new Date()));
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [budgetOnly, setBudgetOnly] = useState(false);
  const [reimbursable, setReimbursable] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (isTransferEdit && transaction) {
      const { fromAccountId: from, toAccountId: to } = resolveTransferAccounts(
        transaction,
        transactions,
      );
      setFromAccountId(from);
      setToAccountId(to);
      setType('transfer');
      setAmount(String(transaction.amount));
      setDate(transaction.date);
      setNote(transaction.note ?? '');
      return;
    }
    setAccountId(transaction?.accountId ?? defaultAccountId ?? accounts[0]?.id ?? '');
    setFromAccountId(defaultAccountId ?? accounts[0]?.id ?? '');
    setToAccountId(accounts.find((item) => item.id !== defaultAccountId)?.id ?? accounts[1]?.id ?? '');
    setType(transaction?.type ?? 'debit');
    setAmount(transaction ? String(transaction.amount) : '');
    setDate(transaction?.date ?? isoDate(new Date()));
    setCategoryId(transaction?.categoryId ?? defaultCategoryId ?? '');
    setNote(transaction?.note ?? '');
    setBudgetOnly(transaction?.budgetOnly ?? false);
    setReimbursable(transaction?.reimbursable ?? false);
  }, [
    accounts,
    defaultAccountId,
    defaultCategoryId,
    isTransferEdit,
    open,
    transaction,
    transactions,
  ]);

  const numericAmount = Number(amount);
  const isTransfer = type === 'transfer';

  const canSave = isTransfer
    ? fromAccountId !== '' &&
      toAccountId !== '' &&
      fromAccountId !== toAccountId &&
      amount.trim() !== '' &&
      Number.isFinite(numericAmount) &&
      numericAmount > 0
    : accountId !== '' &&
      amount.trim() !== '' &&
      Number.isFinite(numericAmount) &&
      (!budgetOnly || categoryId !== '');

  const reimbursementStatus = (() => {
    if (type !== 'debit' || budgetOnly || !reimbursable) return 'none' as const;
    if (isEdit && transaction?.reimbursementStatus === 'received') return 'received' as const;
    return 'pending' as const;
  })();

  const handleSave = () => {
    if (!canSave) return;
    if (isTransfer) {
      onSaveTransfer?.({
        fromAccountId,
        toAccountId,
        amount: Math.abs(numericAmount),
        date,
        note: note.trim() || undefined,
      });
    } else {
      onSave({
        accountId,
        type,
        amount: type === 'adjustment' ? numericAmount : Math.abs(numericAmount),
        date,
        categoryId: type === 'debit' && categoryId ? categoryId : undefined,
        budgetOnly: type === 'debit' ? budgetOnly : false,
        reimbursable: type === 'debit' && !budgetOnly ? reimbursable : false,
        reimbursementStatus,
        note: note.trim() || undefined,
      });
    }
    onClose();
  };

  return (
    <ModalShell
      open={open}
      title={
        isTransferEdit
          ? 'Edit transfer'
          : isEdit
            ? 'Edit transaction'
            : isTransfer
              ? 'New transfer'
              : 'New transaction'
      }
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
        {!isTransferEdit ? (
          <div className="space-y-1.5">
            <label className="label">Type</label>
            <div className="segmented w-full">
              {typeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  data-active={type === option.value}
                  className="flex-1"
                  onClick={() => {
                    setType(option.value);
                    if (option.value !== 'debit') setBudgetOnly(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {isTransfer ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="label">From</label>
              <select
                className="input"
                value={fromAccountId}
                onChange={(e) => setFromAccountId(e.target.value)}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="label">To</label>
              <select
                className="input"
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="label">Account</label>
              <select
                className="input"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="label">Amount</label>
              <input
                className="input"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={type === 'adjustment' ? '+/- delta' : '0.00'}
                autoFocus
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {isTransfer ? (
            <div className="space-y-1.5">
              <label className="label">Amount</label>
              <input
                className="input"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <label className="label">Date</label>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {!isTransfer && type === 'debit' ? (
            <div className="space-y-1.5">
              <label className="label">Category{budgetOnly ? '' : ' (optional)'}</label>
              <select
                className="input"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">{budgetOnly ? 'Select category' : 'Uncategorized'}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label className="label">Note</label>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
          />
        </div>

        {!isTransfer && type === 'debit' ? (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={budgetOnly}
                onChange={(e) => {
                  setBudgetOnly(e.target.checked);
                  if (e.target.checked) setReimbursable(false);
                }}
              />
              Budget only (won&apos;t affect account balance)
            </label>
            {!budgetOnly ? (
              <label className="flex items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={reimbursable}
                  disabled={isEdit && transaction?.reimbursementStatus === 'received'}
                  onChange={(e) => setReimbursable(e.target.checked)}
                />
                Mark as reimbursable
                {isEdit && transaction?.reimbursementStatus === 'received' ? (
                  <span className="text-xs text-muted">(already received)</span>
                ) : null}
              </label>
            ) : null}
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}
