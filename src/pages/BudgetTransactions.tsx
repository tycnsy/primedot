import { useMemo, useState } from 'react';
import BudgetHeader from '../components/budget/BudgetHeader';
import TransactionRow from '../components/budget/TransactionRow';
import TransactionFilters, {
  type TransactionFilterValue,
} from '../components/budget/TransactionFilters';
import AddTransactionModal from '../components/budget/AddTransactionModal';
import {
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

const EMPTY_FILTER: TransactionFilterValue = {
  accountId: 'all',
  type: 'all',
  categoryId: 'all',
  scope: 'all',
  from: '',
  to: '',
};

export default function BudgetTransactions() {
  const { currency } = useBudgetPreferences();
  const { accounts, allAccounts } = useAccounts();
  const { categories } = useCategories();
  const {
    transactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    createTransfer,
    updateTransfer,
    deleteTransfer,
  } = useTransactions();

  const [filter, setFilter] = useState<TransactionFilterValue>(EMPTY_FILTER);
  const [txnModalOpen, setTxnModalOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);

  const accountById = useMemo(
    () => new Map(allAccounts.map((account) => [account.id, account])),
    [allAccounts],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const filtered = useMemo(() => {
    return transactions.filter((txn) => {
      if (filter.accountId !== 'all' && txn.accountId !== filter.accountId) return false;
      if (filter.type !== 'all' && txn.type !== filter.type) return false;
      if (filter.categoryId !== 'all' && txn.categoryId !== filter.categoryId) return false;
      if (filter.scope === 'balance' && txn.budgetOnly) return false;
      if (filter.scope === 'budget_only' && !txn.budgetOnly) return false;
      if (filter.from && txn.date < filter.from) return false;
      if (filter.to && txn.date > filter.to) return false;
      return true;
    });
  }, [transactions, filter]);

  const handleDelete = (txn: Transaction) => {
    const message =
      txn.type === 'transfer'
        ? 'Delete this transfer? Both legs will be removed.'
        : 'Delete this transaction?';
    if (!window.confirm(message)) return;
    if (txn.type === 'transfer' && txn.transferGroupId) {
      deleteTransfer(txn.transferGroupId);
    } else {
      deleteTransaction(txn.id);
    }
  };

  return (
    <div className="space-y-6">
      <BudgetHeader
        title="Transactions"
        subtitle="All activity across accounts. Use budget-only entries to backfill past spending without changing balances."
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setEditingTxn(null);
              setTxnModalOpen(true);
            }}
          >
            + Transaction
          </button>
        }
      />

      <TransactionFilters
        value={filter}
        categories={categories}
        accounts={accounts}
        showScope
        onChange={setFilter}
      />

      {filtered.length === 0 ? (
        <div className="card">
          <p className="text-sm text-muted">No transactions match.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((txn) => {
            const counterpartId = getTransferCounterpartAccountId(transactions, txn);
            return (
              <TransactionRow
                key={txn.id}
                transaction={txn}
                account={accountById.get(txn.accountId)}
                category={txn.categoryId ? categoryById.get(txn.categoryId) : undefined}
                counterpartAccount={
                  counterpartId ? accountById.get(counterpartId) : undefined
                }
                currency={currency}
                onEdit={() => {
                  setEditingTxn(txn);
                  setTxnModalOpen(true);
                }}
                onDelete={() => handleDelete(txn)}
              />
            );
          })}
        </div>
      )}

      <AddTransactionModal
        open={txnModalOpen}
        accounts={accounts}
        categories={categories}
        transactions={transactions}
        transaction={editingTxn}
        defaultAccountId={filter.accountId !== 'all' ? filter.accountId : undefined}
        defaultCategoryId={filter.categoryId !== 'all' ? filter.categoryId : undefined}
        onClose={() => {
          setTxnModalOpen(false);
          setEditingTxn(null);
        }}
        onSave={(input) => {
          if (editingTxn) {
            updateTransaction(editingTxn.id, inputToPatch(input));
          } else {
            addTransaction(input);
          }
        }}
        onSaveTransfer={(input) => {
          if (editingTxn?.type === 'transfer' && editingTxn.transferGroupId) {
            updateTransfer(editingTxn.transferGroupId, input);
          } else {
            createTransfer(input);
          }
        }}
      />
    </div>
  );
}
