import { useEffect, useState } from 'react';
import BudgetProgressBar from './BudgetProgressBar';
import { formatMoney, formatSignedMoney } from '../../features/budget';
import type { CategoryBudget } from '../../features/budget';

interface CategoryRowProps {
  budget: CategoryBudget;
  currency: string;
  valueEditable: boolean;
  planEditable: boolean;
  dateRangeLabel?: string | null;
  draggable: boolean;
  onChangeValue: (value: number) => void;
  validateValue?: (value: number) => string | null;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
}

export default function CategoryRow({
  budget,
  currency,
  valueEditable,
  planEditable,
  dateRangeLabel,
  draggable,
  onChangeValue,
  validateValue,
  onEdit,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
}: CategoryRowProps) {
  const [draft, setDraft] = useState(String(budget.configuredValue));
  const [valueError, setValueError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(String(budget.configuredValue));
    setValueError(null);
  }, [budget.configuredValue]);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    if (budget.budgetType === 'percentage' && validateValue) {
      const error = validateValue(parsed);
      if (error) {
        setValueError(error);
        setDraft(String(budget.configuredValue));
        return;
      }
    }
    setValueError(null);
    onChangeValue(parsed);
  };

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={(e) => {
        if (!draggable) return;
        e.preventDefault();
        onDragOver?.();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop?.();
      }}
      onDragEnd={onDragEnd}
      className={`card flex flex-col gap-2 ${isDragging ? 'opacity-60' : ''} ${
        draggable ? 'cursor-grab' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <p className="font-medium text-fg">{budget.name}</p>
            <span className="pill text-[10px]">
              {budget.budgetType === 'flat' ? 'Flat' : '%'}
            </span>
            {budget.isFixed ? <span className="pill text-[10px]">Fixed</span> : null}
          </div>
          {dateRangeLabel ? (
            <p className="text-[11px] text-muted">{dateRangeLabel}</p>
          ) : null}
        </div>
        {planEditable ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-ghost !px-2 !py-1 text-xs"
              onClick={onEdit}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn-ghost !px-2 !py-1 text-xs text-danger"
              onClick={onDelete}
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        {valueEditable ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <input
                className="input w-[110px] text-sm"
                inputMode="decimal"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setValueError(null);
                }}
                onBlur={() => commit(draft)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
              <span className="text-xs text-muted">
                {budget.budgetType === 'percentage' ? '% of base' : currency}
              </span>
            </div>
            {valueError ? <p className="text-xs text-danger">{valueError}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-muted">
            Budget {formatMoney(budget.effectiveBudget, currency)}
          </p>
        )}
        <div className="ml-auto text-right">
          <p className="text-sm font-semibold tabular-nums text-fg">
            {formatMoney(budget.spent, currency)} / {formatMoney(budget.effectiveBudget, currency)}
          </p>
          <p
            className={`text-xs tabular-nums ${
              budget.remaining < 0 ? 'text-danger' : 'text-muted'
            }`}
          >
            {budget.remaining >= 0 ? 'Remaining ' : 'Over by '}
            {formatMoney(Math.abs(budget.remaining), currency)}
          </p>
        </div>
      </div>

      <BudgetProgressBar pctUsed={budget.pctUsed} status={budget.status} />

      {budget.carryOver !== 0 ? (
        <p className="text-[11px] text-muted">
          Carry-over: {formatSignedMoney(budget.carryOver, currency)}
        </p>
      ) : null}
    </div>
  );
}
