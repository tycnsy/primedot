import { formatMoney } from '../../features/budget';
import type { Account, AccountType, Category, Transaction } from '../../features/budget';
import { displaySignedAmount } from '../../features/budget';

interface TransactionRowProps {
  transaction: Transaction;
  account?: Account;
  category?: Category;
  counterpartAccount?: Account;
  currency: string;
  onEdit?: () => void;
  onDelete?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onSelectToggle?: () => void;
}

const TYPE_LABEL: Record<Transaction['type'], string> = {
  debit: 'Expense',
  credit: 'Income',
  adjustment: 'Adjustment',
  transfer: 'Transfer',
};

function typeLabel(type: Transaction['type'], accountType?: AccountType): string {
  if (accountType === 'credit') {
    if (type === 'debit') return 'Charge';
    if (type === 'credit') return 'Payment';
  }
  return TYPE_LABEL[type];
}

function rowTitle(
  transaction: Transaction,
  category: Category | undefined,
  account: Account | undefined,
  counterpartAccount: Account | undefined,
): string {
  if (transaction.note) return transaction.note;
  if (transaction.type === 'transfer' && counterpartAccount) {
    return transaction.transferLeg === 'out'
      ? `Transfer to ${counterpartAccount.name}`
      : `Transfer from ${counterpartAccount.name}`;
  }
  if (category) return category.name;
  return typeLabel(transaction.type, account?.type);
}

export default function TransactionRow({
  transaction,
  account,
  category,
  counterpartAccount,
  currency,
  onEdit,
  onDelete,
  selectable = false,
  selected = false,
  onSelectToggle,
}: TransactionRowProps) {
  const signed = account
    ? displaySignedAmount(
        account.type,
        transaction.type,
        transaction.amount,
        transaction.budgetOnly,
        transaction.transferLeg,
      )
    : transaction.budgetOnly
      ? -transaction.amount
      : transaction.type === 'debit' || transaction.type === 'transfer'
        ? -transaction.amount
        : transaction.amount;

  const showActions = !selectable && (onEdit || onDelete);

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 ${
        selectable ? 'cursor-pointer' : ''
      } ${selectable && selected ? 'border-accent bg-accent/5' : ''}`}
      onClick={selectable ? onSelectToggle : undefined}
      onKeyDown={
        selectable
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectToggle?.();
              }
            }
          : undefined
      }
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? 0 : undefined}
    >
      {selectable ? (
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 accent-accent"
          checked={selected}
          onChange={onSelectToggle}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Select ${rowTitle(transaction, category, account, counterpartAccount)}`}
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-fg">
            {rowTitle(transaction, category, account, counterpartAccount)}
          </p>
          {transaction.budgetOnly ? (
            <span className="pill text-[10px]">Budget only</span>
          ) : null}
          {transaction.reimbursable ? (
            <span className="pill text-[10px]">
              {transaction.reimbursementStatus === 'received' ? 'Reimbursed' : 'Reimbursable'}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted">
          {transaction.date}
          {category ? ` · ${category.name}` : ''}
          {account ? ` · ${account.name}` : ''}
        </p>
      </div>
      <p
        className={`shrink-0 text-sm font-semibold tabular-nums ${
          signed > 0 ? 'text-success' : signed < 0 ? 'text-danger' : 'text-fg'
        }`}
      >
        {formatMoney(signed, currency)}
      </p>
      {showActions ? (
        <div className="flex shrink-0 items-center gap-0.5">
          {onEdit ? (
            <button
              type="button"
              className="btn-ghost !px-2 !py-1 text-xs text-muted"
              aria-label="Edit transaction"
              onClick={onEdit}
            >
              Edit
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="btn-ghost !px-2 !py-1 text-xs text-muted"
              aria-label="Delete transaction"
              onClick={onDelete}
            >
              ✕
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
