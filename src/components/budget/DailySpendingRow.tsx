import BudgetProgressBar from './BudgetProgressBar';
import { formatMoney, formatSignedMoney } from '../../features/budget';
import type { CategoryDailyState } from '../../features/budget';

interface DailySpendingRowProps {
  state: CategoryDailyState;
  currency: string;
  onToggleHidden: () => void;
  hiddenActionLabel: 'Hide' | 'Show';
}

export default function DailySpendingRow({
  state,
  currency,
  onToggleHidden,
  hiddenActionLabel,
}: DailySpendingRowProps) {
  const isNegative = state.balance < 0;
  const progressBasis = Math.max(state.available, state.dailyRate, 0.01);
  const pctUsed = isNegative ? 1 : state.spentToday / progressBasis;
  const barStatus = isNegative ? 'over' : state.status;

  return (
    <div
      className={`card flex flex-col gap-2 ${
        isNegative ? 'border-danger/40 bg-danger/10' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="font-medium text-fg">{state.name}</p>
          <span className="pill text-[10px]">
            {state.budgetType === 'flat' ? 'Flat' : '%'}
          </span>
          {state.isFixed ? <span className="pill text-[10px]">Fixed</span> : null}
        </div>
        <button
          type="button"
          className="btn-ghost !px-2 !py-1 text-xs"
          onClick={onToggleHidden}
        >
          {hiddenActionLabel}
        </button>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted">
            Rollover {formatSignedMoney(state.rollover, currency)}
          </p>
          <p className="text-xs text-muted">
            + Daily {formatMoney(state.allowance, currency)}
          </p>
          <p
            className={`font-medium tabular-nums ${
              state.available < 0 ? 'text-danger' : 'text-fg'
            }`}
          >
            Available {formatSignedMoney(state.available, currency)}
          </p>
        </div>
        <div className="text-right sm:text-right">
          <p className="text-sm font-semibold tabular-nums text-fg">
            Spent {formatMoney(state.spentToday, currency)}
          </p>
          <p
            className={`text-xs tabular-nums ${
              state.balance < 0 ? 'text-danger' : 'text-muted'
            }`}
          >
            End of day {formatSignedMoney(state.balance, currency)}
          </p>
        </div>
      </div>

      <BudgetProgressBar pctUsed={pctUsed} status={barStatus} />
    </div>
  );
}
