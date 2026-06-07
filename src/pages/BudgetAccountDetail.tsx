import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BudgetSubnav from '../components/budget/BudgetSubnav';
import TransactionRow from '../components/budget/TransactionRow';
import TransactionFilters, {
  type TransactionFilterValue,
} from '../components/budget/TransactionFilters';
import AddTransactionModal from '../components/budget/AddTransactionModal';
import BalanceAdjustModal from '../components/budget/BalanceAdjustModal';
import {
  accountBalance,
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

const EMPTY_FILTER: TransactionFilterValue = {
  accountId: 'all',
  type: 'all',
  categoryId: 'all',
  scope: 'all',
  from: '',
  to: '',
};

export default function BudgetAccountDetail() {
  const { accountId } = useParams<{ accountId: string }>();
  const { currency } = useBudgetPreferences();
  const { allAccounts } = useAccounts();
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
  const [adjustOpen, setAdjustOpen] = useState(false);

  const account = allAccounts.find((item) => item.id === accountId);
  const activeAccounts = useMemo(
    () => allAccounts.filter((item) => !item.archivedAt),
    [allAccounts],
  );
  const accountById = useMemo(
    () => new Map(allAccounts.map((item) => [item.id, item])),
    [allAccounts],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const accountTransactions = useMemo(
    () => transactions.filter((txn) => txn.accountId === accountId),
    [accountId, transactions],
  );
  const balance = useMemo(
    () => (account ? accountBalance(account, accountTransactions) : 0),
    [account, accountTransactions],
  );

  const filtered = useMemo(() => {
    return accountTransactions.filter((txn) => {
      if (filter.type !== 'all' && txn.type !== filter.type) return false;
      if (filter.categoryId !== 'all' && txn.categoryId !== filter.categoryId) return false;
      if (filter.from && txn.date < filter.from) return false;
      if (filter.to && txn.date > filter.to) return false;
      return true;
    });
  }, [accountTransactions, filter]);

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

  if (!account) {
    return (
      <div className="space-y-6">
        <BudgetSubnav />
        <div className="card">
          <p className="text-sm text-muted">Account not found.</p>
          <Link to="/budget/accounts" className="mt-2 inline-block text-sm text-accent">
            ← Back to accounts
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BudgetSubnav />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Link to="/budget/accounts" className="text-xs text-muted hover:text-fg">
            ← Accounts
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{account.name}</h1>
          <p className="text-sm text-muted">
            {account.type === 'credit' ? 'Owed' : 'Balance'}:{' '}
            <span
              className={`font-medium tabular-nums ${
                account.type === 'credit' && balance > 0 ? 'text-danger' : 'text-fg'
              }`}
            >
              {formatMoney(balance, currency)}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={() => setAdjustOpen(true)}>
            Adjust
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
      </div>

      <TransactionFilters value={filter} categories={categories} onChange={setFilter} />

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
                account={account}
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
        accounts={activeAccounts}
        categories={categories}
        transactions={transactions}
        transaction={editingTxn}
        defaultAccountId={account.id}
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

      <BalanceAdjustModal
        open={adjustOpen}
        account={account}
        currentBalance={balance}
        currency={currency}
        onClose={() => setAdjustOpen(false)}
        onSave={(delta) =>
          addTransaction({
            accountId: account.id,
            amount: delta,
            date: new Date().toISOString().slice(0, 10),
            type: 'adjustment',
            note: 'Manual balance correction',
          })
        }
      />
    </div>
  );
}
