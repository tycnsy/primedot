import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import BudgetHeader from '../components/budget/BudgetHeader';
import BudgetProgressBar from '../components/budget/BudgetProgressBar';
import {
  balancesByAccount,
  computeMonthlyBudget,
  earningsForMonth,
  formatMoney,
  isoDate,
  monthBounds,
  monthKey,
  netWorth,
  useAccounts,
  useBudgetPreferences,
  useCategories,
  useIncome,
  useTransactions,
} from '../features/budget';

export default function BudgetDashboard() {
  const { currency } = useBudgetPreferences();
  const { accounts } = useAccounts();
  const { transactions } = useTransactions();
  const { categories } = useCategories();
  const { incomeEntries } = useIncome();

  const month = monthKey(new Date());
  const today = isoDate(new Date());

  const balances = useMemo(
    () => balancesByAccount(accounts, transactions),
    [accounts, transactions],
  );
  const worth = useMemo(() => netWorth(accounts, balances), [accounts, balances]);

  const budget = useMemo(
    () =>
      computeMonthlyBudget({
        month,
        categories,
        incomeEntries,
        transactions,
      }),
    [categories, incomeEntries, month, transactions],
  );

  const monthlyEarnings = useMemo(
    () => earningsForMonth(month, incomeEntries),
    [incomeEntries, month],
  );

  const upcomingIncome = useMemo(() => {
    const { end: monthEnd } = monthBounds(month);
    return incomeEntries
      .filter(
        (entry) =>
          entry.status === 'expected' &&
          entry.expectedDate >= today &&
          entry.expectedDate <= monthEnd,
      )
      .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
  }, [incomeEntries, month, today]);
  const upcomingIncomeTotal = upcomingIncome.reduce((sum, entry) => sum + entry.amount, 0);

  const outstandingReimbursements = useMemo(
    () =>
      transactions.filter(
        (txn) => txn.reimbursable && txn.reimbursementStatus !== 'received',
      ),
    [transactions],
  );
  const outstandingTotal = outstandingReimbursements.reduce((sum, txn) => sum + txn.amount, 0);

  return (
    <div className="space-y-6">
      <BudgetHeader
        title="Dashboard"
        subtitle={new Intl.DateTimeFormat('en-US', {
          month: 'long',
          year: 'numeric',
        }).format(new Date())}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Net worth" value={formatMoney(worth.net, currency)} />
        <StatCard label="Assets" value={formatMoney(worth.assets, currency)} />
        <StatCard
          label="Liabilities"
          value={formatMoney(worth.liabilities, currency)}
          danger={worth.liabilities > 0}
        />
        <StatCard
          label="Monthly earnings"
          value={formatMoney(monthlyEarnings, currency)}
          href="/budget/earnings"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <p className="label">Spent vs budgeted</p>
            <Link to="/budget/categories" className="text-xs text-accent">
              Manage →
            </Link>
          </div>
          {budget.categories.length === 0 ? (
            <p className="text-sm text-muted">No categories yet.</p>
          ) : (
            <div className="space-y-3">
              {budget.categories.map((category) => (
                <div key={category.categoryId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-fg">{category.name}</span>
                    <span className="tabular-nums text-muted">
                      {formatMoney(category.spent, currency)} /{' '}
                      {formatMoney(category.effectiveBudget, currency)}
                    </span>
                  </div>
                  <BudgetProgressBar pctUsed={category.pctUsed} status={category.status} />
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="space-y-4">
          <section className="card space-y-2">
            <div className="flex items-center justify-between">
              <p className="label">Upcoming income · rest of month</p>
              <Link to="/budget/income" className="text-xs text-accent">
                Plan →
              </Link>
            </div>
            <p className="text-xl font-semibold tabular-nums text-fg">
              {formatMoney(upcomingIncomeTotal, currency)}
            </p>
            {upcomingIncome.length === 0 ? (
              <p className="text-sm text-muted">Nothing expected rest of month.</p>
            ) : (
              <ul className="space-y-1">
                {upcomingIncome.map((entry) => (
                  <li key={entry.id} className="flex justify-between text-sm">
                    <span className="text-muted">
                      {entry.sourceName}
                      <span className="ml-1 text-xs text-subtle">{entry.expectedDate}</span>
                    </span>
                    <span className="tabular-nums text-fg">
                      {formatMoney(entry.amount, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card space-y-1">
            <div className="flex items-center justify-between">
              <p className="label">Outstanding reimbursements</p>
              <Link to="/budget/reimbursements" className="text-xs text-accent">
                View →
              </Link>
            </div>
            <p className="text-xl font-semibold tabular-nums text-fg">
              {formatMoney(outstandingTotal, currency)}
            </p>
            <p className="text-sm text-muted">
              {outstandingReimbursements.length} pending item
              {outstandingReimbursements.length === 1 ? '' : 's'}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  danger,
  href,
}: {
  label: string;
  value: string;
  danger?: boolean;
  href?: string;
}) {
  return (
    <div className="card">
      {href ? (
        <Link to={href} className="label text-accent hover:underline">
          {label}
        </Link>
      ) : (
        <p className="label">{label}</p>
      )}
      <p className={`mt-1 text-xl font-semibold tabular-nums ${danger ? 'text-danger' : 'text-fg'}`}>
        {value}
      </p>
    </div>
  );
}
