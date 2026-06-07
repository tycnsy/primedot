import { NavLink } from 'react-router-dom';

const TABS: { to: string; label: string; end?: boolean }[] = [
  { to: '/budget', label: 'Dashboard', end: true },
  { to: '/budget/accounts', label: 'Accounts' },
  { to: '/budget/transactions', label: 'Transactions' },
  { to: '/budget/categories', label: 'Budget' },
  { to: '/budget/income', label: 'Income' },
  { to: '/budget/earnings', label: 'Earnings' },
  { to: '/budget/debt', label: 'Debt' },
  { to: '/budget/savings', label: 'Savings' },
  { to: '/budget/reimbursements', label: 'Reimbursements' },
];

export default function BudgetSubnav() {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface2/70 p-1">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
