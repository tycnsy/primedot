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

function canBulkEditCategory(txn: Transaction): boolean {
  return txn.type === 'debit';
}

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
    bulkUpdateCategory,
    createTransfer,
    updateTransfer,
    deleteTransfer,
  } = useTransactions();

  const [filter, setFilter] = useState<TransactionFilterValue>(EMPTY_FILTER);
  const [txnModalOpen, setTxnModalOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkApplying, setBulkApplying] = useState(false);

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

  const selectableIds = useMemo(
    () => filtered.filter(canBulkEditCategory).map((txn) => txn.id),
    [filtered],
  );

  const exitBulkMode = () => {
    setBulkMode(false);
    setSelectedIds(new Set());
    setBulkCategoryId('');
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApplyBulkCategory = async () => {
    if (selectedIds.size === 0) return;
    setBulkApplying(true);
    try {
      await bulkUpdateCategory(
        [...selectedIds],
        bulkCategoryId ? bulkCategoryId : null,
      );
      exitBulkMode();
    } finally {
      setBulkApplying(false);
    }
  };

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
          bulkMode ? (
            <button type="button" className="btn-secondary" onClick={exitBulkMode}>
              Cancel
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setBulkMode(true)}
              >
                Bulk edit
              </button>
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
            </div>
          )
        }
      />

      <TransactionFilters
        value={filter}
        categories={categories}
        accounts={accounts}
        showScope
        onChange={setFilter}
      />

      {bulkMode ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface2/50 p-3">
          <p className="text-sm text-fg">
            {selectedIds.size} selected
            {selectableIds.length > 0
              ? ` · ${selectableIds.length} expense${selectableIds.length === 1 ? '' : 's'} in view`
              : ''}
          </p>
          <button
            type="button"
            className="btn-ghost text-xs"
            disabled={selectableIds.length === 0}
            onClick={() => setSelectedIds(new Set(selectableIds))}
          >
            Select all
          </button>
          <button
            type="button"
            className="btn-ghost text-xs"
            disabled={selectedIds.size === 0}
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </button>
          <div className="space-y-1">
            <span className="label">New category</span>
            <select
              className="input w-[180px]"
              value={bulkCategoryId}
              onChange={(e) => setBulkCategoryId(e.target.value)}
            >
              <option value="">Uncategorized</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={selectedIds.size === 0 || bulkApplying}
            onClick={handleApplyBulkCategory}
          >
            {bulkApplying ? 'Applying…' : 'Apply category'}
          </button>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="card">
          <p className="text-sm text-muted">No transactions match.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((txn) => {
            const counterpartId = getTransferCounterpartAccountId(transactions, txn);
            const selectable = bulkMode && canBulkEditCategory(txn);
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
                selectable={selectable}
                selected={selectedIds.has(txn.id)}
                onSelectToggle={
                  selectable ? () => toggleSelected(txn.id) : undefined
                }
                onEdit={
                  bulkMode
                    ? undefined
                    : () => {
                        setEditingTxn(txn);
                        setTxnModalOpen(true);
                      }
                }
                onDelete={bulkMode ? undefined : () => handleDelete(txn)}
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
