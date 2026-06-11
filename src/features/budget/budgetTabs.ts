export const BUDGET_TABS = [
  { id: 'dashboard', to: '/budget', label: 'Dashboard', end: true },
  { id: 'accounts', to: '/budget/accounts', label: 'Accounts' },
  { id: 'transactions', to: '/budget/transactions', label: 'Transactions' },
  { id: 'categories', to: '/budget/categories', label: 'Budget' },
  { id: 'spending', to: '/budget/spending', label: 'Spending' },
  { id: 'income', to: '/budget/income', label: 'Income' },
  { id: 'earnings', to: '/budget/earnings', label: 'Earnings' },
  { id: 'debt', to: '/budget/debt', label: 'Debt' },
  { id: 'savings', to: '/budget/savings', label: 'Savings' },
  { id: 'reimbursements', to: '/budget/reimbursements', label: 'Reimbursements' },
] as const;

export type BudgetTab = (typeof BUDGET_TABS)[number];
export type BudgetTabId = BudgetTab['id'];
