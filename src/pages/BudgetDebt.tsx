import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import BudgetHeader from '../components/budget/BudgetHeader';
import DebtPayoffCard from '../components/budget/DebtPayoffCard';
import {
  accountBalance,
  orderAccounts,
  useAccounts,
  useBudgetPreferences,
  useTransactions,
} from '../features/budget';
import type { PayoffAccount } from '../features/budget';

export default function BudgetDebt() {
  const { currency, payoffStrategy, setPayoffStrategy, payoffMode, setPayoffMode } =
    useBudgetPreferences();
  const { accounts } = useAccounts();
  const { transactions } = useTransactions();
  const [extra, setExtra] = useState('0');

  const creditAccounts = useMemo(
    () => accounts.filter((account) => account.type === 'credit'),
    [accounts],
  );

  const ordered = useMemo<PayoffAccount[]>(() => {
    const withBalances = creditAccounts.map((account) => ({
      account,
      balance: accountBalance(account, transactions),
    }));
    return orderAccounts(withBalances, payoffStrategy);
  }, [creditAccounts, payoffStrategy, transactions]);

  const extraPayment = Math.max(0, Number(extra) || 0);

  return (
    <div className="space-y-6">
      <BudgetHeader title="Debt Payoff" subtitle="Plan how to clear your credit balances." />

      {creditAccounts.length === 0 ? (
        <div className="card">
          <p className="text-sm text-muted">
            No credit accounts yet. Add one from{' '}
            <Link to="/budget/accounts" className="text-accent">
              Accounts
            </Link>{' '}
            to plan a payoff.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-surface2/50 p-3">
            <div className="space-y-1">
              <span className="label">Strategy</span>
              <div className="segmented">
                <button
                  type="button"
                  data-active={payoffStrategy === 'avalanche'}
                  onClick={() => setPayoffStrategy('avalanche')}
                >
                  Avalanche
                </button>
                <button
                  type="button"
                  data-active={payoffStrategy === 'snowball'}
                  onClick={() => setPayoffStrategy('snowball')}
                >
                  Snowball
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <span className="label">Payment mode</span>
              <div className="segmented">
                <button
                  type="button"
                  data-active={payoffMode === 'minimumOnly'}
                  onClick={() => setPayoffMode('minimumOnly')}
                >
                  Minimum only
                </button>
                <button
                  type="button"
                  data-active={payoffMode === 'fixedExtra'}
                  onClick={() => setPayoffMode('fixedExtra')}
                >
                  Fixed extra
                </button>
              </div>
            </div>
            {payoffMode === 'fixedExtra' ? (
              <div className="space-y-1">
                <span className="label">Extra / month</span>
                <input
                  className="input w-[120px]"
                  inputMode="decimal"
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                />
              </div>
            ) : null}
          </div>

          <p className="text-xs text-muted">
            {payoffStrategy === 'avalanche'
              ? 'Avalanche targets the highest APR first to minimize interest.'
              : 'Snowball targets the smallest balance first for quick wins.'}
          </p>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3.5">
            {ordered.map(({ account, balance }) => (
              <DebtPayoffCard
                key={account.id}
                account={account}
                balance={balance}
                currency={currency}
                mode={payoffMode}
                extraPayment={extraPayment}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
