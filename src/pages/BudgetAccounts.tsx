import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BudgetHeader from '../components/budget/BudgetHeader';
import AccountCard from '../components/budget/AccountCard';
import AddAccountModal from '../components/budget/AddAccountModal';
import BalanceAdjustModal from '../components/budget/BalanceAdjustModal';
import AddTransactionModal from '../components/budget/AddTransactionModal';
import {
  balancesByAccount,
  formatMoney,
  netWorth,
  useAccounts,
  useBudgetPreferences,
  useCategories,
  useTransactions,
} from '../features/budget';
import type { Account } from '../features/budget';

export default function BudgetAccounts() {
  const navigate = useNavigate();
  const { currency } = useBudgetPreferences();
  const { accounts, isLoading, createAccount, updateAccount, archiveAccount } = useAccounts();
  const { transactions, addTransaction, createTransfer } = useTransactions();
  const { categories } = useCategories();

  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [adjustAccount, setAdjustAccount] = useState<Account | null>(null);
  const [txnModalOpen, setTxnModalOpen] = useState(false);

  const balances = useMemo(
    () => balancesByAccount(accounts, transactions),
    [accounts, transactions],
  );
  const worth = useMemo(() => netWorth(accounts, balances), [accounts, balances]);

  const openCreate = () => {
    setEditAccount(null);
    setAccountModalOpen(true);
  };
  const openEdit = (account: Account) => {
    setEditAccount(account);
    setAccountModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <BudgetHeader
        title="Accounts"
        subtitle={`Net worth ${formatMoney(worth.net, currency)}`}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => setTxnModalOpen(true)}>
              + Transaction
            </button>
            <button type="button" className="btn-primary" onClick={openCreate}>
              + Account
            </button>
          </>
        }
      />

      {isLoading ? (
        <div className="card">
          <p className="text-sm text-muted">Loading accounts…</p>
        </div>
      ) : accounts.length === 0 ? (
        <div className="card">
          <p className="text-sm text-muted">
            No accounts yet. Add your first checking, savings, or credit account to start tracking.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              balance={balances[account.id] ?? 0}
              currency={currency}
              onOpen={() => navigate(`/budget/accounts/${account.id}`)}
              onAdjust={() => setAdjustAccount(account)}
              onEdit={() => openEdit(account)}
              onArchive={() => {
                if (window.confirm(`Archive ${account.name}?`)) archiveAccount(account.id);
              }}
            />
          ))}
        </div>
      )}

      <AddAccountModal
        open={accountModalOpen}
        account={editAccount}
        onClose={() => setAccountModalOpen(false)}
        onSave={(input) => {
          if (editAccount) updateAccount(editAccount.id, input);
          else createAccount(input);
        }}
      />

      <BalanceAdjustModal
        open={!!adjustAccount}
        account={adjustAccount}
        currentBalance={adjustAccount ? balances[adjustAccount.id] ?? 0 : 0}
        currency={currency}
        onClose={() => setAdjustAccount(null)}
        onSave={(delta) => {
          if (!adjustAccount) return;
          addTransaction({
            accountId: adjustAccount.id,
            amount: delta,
            date: new Date().toISOString().slice(0, 10),
            type: 'adjustment',
            note: 'Manual balance correction',
          });
        }}
      />

      <AddTransactionModal
        open={txnModalOpen}
        accounts={accounts}
        categories={categories}
        transactions={transactions}
        onClose={() => setTxnModalOpen(false)}
        onSave={(input) => addTransaction(input)}
        onSaveTransfer={(input) => createTransfer(input)}
      />
    </div>
  );
}
