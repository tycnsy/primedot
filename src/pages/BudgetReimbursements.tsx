import { useMemo, useState } from 'react';
import BudgetHeader from '../components/budget/BudgetHeader';
import AddTransactionModal from '../components/budget/AddTransactionModal';
import TransactionRow from '../components/budget/TransactionRow';
import {
  formatMoney,
  getTransferCounterpartAccountId,
  useAccounts,
  useBudgetPreferences,
  useCategories,
  useTransactions,
  type NewTransactionInput,
  type Transaction,
} from '../features/budget';

function inputToPatch(input: NewTransactionInput): Partial<Transaction> {
  return {
    accountId: input.accountId,
    type: input.type,
    amount: input.amount,
    date: input.date,
    categoryId: input.categoryId,
    budgetOnly: input.budgetOnly ?? false,
    reimbursable: input.reimbursable ?? false,
    reimbursementStatus: input.reimbursementStatus,
    note: input.note,
  };
}

export default function BudgetReimbursements() {
  const { currency } = useBudgetPreferences();
  const { allAccounts } = useAccounts();
  const { categories } = useCategories();
  const { transactions, updateTransaction, markReimbursementReceived } = useTransactions();
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);

  const accountById = useMemo(
    () => new Map(allAccounts.map((account) => [account.id, account])),
    [allAccounts],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const reimbursable = useMemo(
    () => transactions.filter((txn) => txn.reimbursable),
    [transactions],
  );
  const pending = useMemo(
    () => reimbursable.filter((txn) => txn.reimbursementStatus !== 'received'),
    [reimbursable],
  );
  const received = useMemo(
    () => reimbursable.filter((txn) => txn.reimbursementStatus === 'received'),
    [reimbursable],
  );
  const outstandingTotal = pending.reduce((sum, txn) => sum + txn.amount, 0);

  const renderRow = (txn: Transaction, withAction: boolean) => {
    const counterpartId = getTransferCounterpartAccountId(transactions, txn);
    return (
    <div key={txn.id} className="flex items-center gap-2">
      <div className="flex-1">
        <TransactionRow
          transaction={txn}
          account={accountById.get(txn.accountId)}
          category={txn.categoryId ? categoryById.get(txn.categoryId) : undefined}
          counterpartAccount={
            counterpartId ? accountById.get(counterpartId) : undefined
          }
          currency={currency}
          onEdit={() => setEditingTxn(txn)}
        />
      </div>
      {withAction ? (
        <button
          type="button"
          className="btn-secondary !py-1 text-xs"
          onClick={() => markReimbursementReceived(txn)}
        >
          Mark received
        </button>
      ) : null}
    </div>
    );
  };

  return (
    <div className="space-y-6">
      <BudgetHeader title="Reimbursements" subtitle="Track money owed back to you." />

      <div className="card">
        <p className="label">Outstanding</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums text-fg">
          {formatMoney(outstandingTotal, currency)}
        </p>
        <p className="text-sm text-muted">
          {pending.length} pending item{pending.length === 1 ? '' : 's'}
        </p>
      </div>

      <section className="space-y-2">
        <div className="flex items-center gap-3">
          <p className="label">Pending</p>
          <div className="h-px flex-1 bg-border" />
        </div>
        {pending.length === 0 ? (
          <div className="card">
            <p className="text-sm text-muted">No pending reimbursements.</p>
          </div>
        ) : (
          <div className="space-y-2">{pending.map((txn) => renderRow(txn, true))}</div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-3">
          <p className="label">Received</p>
          <div className="h-px flex-1 bg-border" />
        </div>
        {received.length === 0 ? (
          <div className="card">
            <p className="text-sm text-muted">Nothing received yet.</p>
          </div>
        ) : (
          <div className="space-y-2">{received.map((txn) => renderRow(txn, false))}</div>
        )}
      </section>

      <AddTransactionModal
        open={editingTxn !== null}
        accounts={allAccounts.filter((item) => !item.archivedAt)}
        categories={categories}
        transaction={editingTxn}
        onClose={() => setEditingTxn(null)}
        onSave={(input) => {
          if (editingTxn) updateTransaction(editingTxn.id, inputToPatch(input));
        }}
      />
    </div>
  );
}
