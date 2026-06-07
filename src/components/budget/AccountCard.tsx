import { creditUtilization, formatMoney, formatPercent } from '../../features/budget';
import type { Account } from '../../features/budget';

interface AccountCardProps {
  account: Account;
  balance: number;
  currency: string;
  onOpen: () => void;
  onAdjust: () => void;
  onEdit: () => void;
  onArchive: () => void;
}

const TYPE_LABEL: Record<Account['type'], string> = {
  checking: 'Checking',
  savings: 'Savings',
  credit: 'Credit',
};

export default function AccountCard({
  account,
  balance,
  currency,
  onOpen,
  onAdjust,
  onEdit,
  onArchive,
}: AccountCardProps) {
  const utilization = creditUtilization(account, balance);

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <button type="button" className="text-left" onClick={onOpen}>
          <p className="font-medium text-fg transition-colors hover:text-accent">{account.name}</p>
          <span className="pill mt-1">{TYPE_LABEL[account.type]}</span>
        </button>
        <div className="text-right">
          <p className="text-xs text-muted">{account.type === 'credit' ? 'Owed' : 'Balance'}</p>
          <p
            className={`text-lg font-semibold tabular-nums ${
              account.type === 'credit' && balance > 0 ? 'text-danger' : 'text-fg'
            }`}
          >
            {formatMoney(balance, currency)}
          </p>
        </div>
      </div>

      {account.type === 'credit' && utilization != null ? (
        <p className="text-xs text-muted">
          Utilization:{' '}
          <span className="font-medium text-fg">{formatPercent(utilization)}</span>
          {account.creditLimit ? ` of ${formatMoney(account.creditLimit, currency)}` : ''}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary !py-1 text-xs" onClick={onOpen}>
          History
        </button>
        <button type="button" className="btn-ghost !py-1 text-xs" onClick={onAdjust}>
          Adjust
        </button>
        <button type="button" className="btn-ghost !py-1 text-xs" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="btn-ghost !py-1 text-xs text-danger" onClick={onArchive}>
          Archive
        </button>
      </div>
    </div>
  );
}
