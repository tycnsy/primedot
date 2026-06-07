import type { Account, Category, TransactionType } from '../../features/budget';

export type TransactionScopeFilter = 'all' | 'balance' | 'budget_only';

export interface TransactionFilterValue {
  accountId: string | 'all';
  type: TransactionType | 'all';
  categoryId: string | 'all';
  scope: TransactionScopeFilter;
  from: string;
  to: string;
}

interface TransactionFiltersProps {
  value: TransactionFilterValue;
  categories: Category[];
  accounts?: Account[];
  showScope?: boolean;
  onChange: (value: TransactionFilterValue) => void;
}

const TYPES: { value: TransactionType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'debit', label: 'Expense' },
  { value: 'credit', label: 'Income' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'transfer', label: 'Transfer' },
];

const SCOPES: { value: TransactionScopeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'balance', label: 'Balance' },
  { value: 'budget_only', label: 'Budget only' },
];

const EMPTY_FILTER: TransactionFilterValue = {
  accountId: 'all',
  type: 'all',
  categoryId: 'all',
  scope: 'all',
  from: '',
  to: '',
};

function isFiltered(value: TransactionFilterValue, hasAccounts: boolean, showScope: boolean) {
  return (
    (hasAccounts && value.accountId !== 'all') ||
    value.type !== 'all' ||
    value.categoryId !== 'all' ||
    (showScope && value.scope !== 'all') ||
    !!value.from ||
    !!value.to
  );
}

export default function TransactionFilters({
  value,
  categories,
  accounts,
  showScope = false,
  onChange,
}: TransactionFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface2/50 p-3">
      {accounts ? (
        <div className="space-y-1">
          <span className="label">Account</span>
          <select
            className="input w-[180px]"
            value={value.accountId}
            onChange={(e) => onChange({ ...value, accountId: e.target.value })}
          >
            <option value="all">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {showScope ? (
        <div className="space-y-1">
          <span className="label">Scope</span>
          <div className="segmented">
            {SCOPES.map((option) => (
              <button
                key={option.value}
                type="button"
                data-active={value.scope === option.value}
                onClick={() => onChange({ ...value, scope: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="space-y-1">
        <span className="label">Type</span>
        <div className="segmented">
          {TYPES.map((option) => (
            <button
              key={option.value}
              type="button"
              data-active={value.type === option.value}
              onClick={() => onChange({ ...value, type: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <span className="label">Category</span>
        <select
          className="input w-[180px]"
          value={value.categoryId}
          onChange={(e) => onChange({ ...value, categoryId: e.target.value })}
        >
          <option value="all">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <span className="label">From</span>
        <input
          type="date"
          className="input w-[150px]"
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <span className="label">To</span>
        <input
          type="date"
          className="input w-[150px]"
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
        />
      </div>
      {isFiltered(value, !!accounts, showScope) ? (
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() => onChange(EMPTY_FILTER)}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
