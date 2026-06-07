import { formatMoney, savingsProjection } from '../../features/budget';
import type { Account, SavingsGoal } from '../../features/budget';

interface SavingsGoalCardProps {
  goal: SavingsGoal;
  linkedAccount?: Account;
  currency: string;
  onContribute: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function SavingsGoalCard({
  goal,
  linkedAccount,
  currency,
  onContribute,
  onEdit,
  onDelete,
}: SavingsGoalCardProps) {
  const projection = savingsProjection(goal);
  const width = Math.min(100, projection.pct * 100);

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-fg">{goal.name}</p>
          {linkedAccount ? (
            <span className="pill mt-1 text-[10px]">Linked · {linkedAccount.name}</span>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums text-fg">
            {formatMoney(goal.contributedAmount, currency)}
          </p>
          <p className="text-xs text-muted">of {formatMoney(goal.targetAmount, currency)}</p>
        </div>
      </div>

      <div className="progress-track">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            projection.complete ? 'progress-fill-success' : 'progress-fill'
          }`}
          style={{ width: `${width}%` }}
        />
      </div>

      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
        <span>{goal.targetDate ? `Target ${goal.targetDate}` : 'No target date'}</span>
        <span>
          {projection.complete
            ? 'Funded'
            : projection.projectedDate
              ? `Projected ${projection.projectedDate}`
              : 'Add a contribution to project'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary !py-1 text-xs" onClick={onContribute}>
          Contribute
        </button>
        <button type="button" className="btn-ghost !py-1 text-xs" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="btn-ghost !py-1 text-xs text-danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
