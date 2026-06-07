import { useEffect, useMemo, useState } from 'react';
import ModalShell from '../goals/ModalShell';
import {
  compareMonths,
  lastActiveMonthFromArchived,
  monthFromParts,
  monthKey,
  monthYearParts,
  validatePercentageAllocation,
} from '../../features/budget';
import type { Category, CategoryType, NewCategoryInput } from '../../features/budget';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function yearOptions(anchorYear: number): number[] {
  const start = anchorYear - 2;
  return Array.from({ length: 7 }, (_, i) => start + i);
}

interface AddCategoryModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (input: NewCategoryInput) => void;
  mode?: 'create' | 'edit';
  category?: Category | null;
  defaultStartMonth?: string;
  viewedMonth: string;
  activeCategories: Category[];
}

export default function AddCategoryModal({
  open,
  onClose,
  onSave,
  mode = 'create',
  category = null,
  defaultStartMonth,
  viewedMonth,
  activeCategories,
}: AddCategoryModalProps) {
  const anchorYear = monthYearParts(defaultStartMonth ?? monthKey(new Date())).year;

  const [name, setName] = useState('');
  const [budgetType, setBudgetType] = useState<CategoryType>('flat');
  const [budgetValue, setBudgetValue] = useState('');
  const [isFixed, setIsFixed] = useState(false);
  const [startYear, setStartYear] = useState(anchorYear);
  const [startMonthNum, setStartMonthNum] = useState(1);
  const [hasEndMonth, setHasEndMonth] = useState(false);
  const [endYear, setEndYear] = useState(anchorYear);
  const [endMonthNum, setEndMonthNum] = useState(1);

  const years = useMemo(() => yearOptions(anchorYear), [anchorYear]);

  useEffect(() => {
    if (!open) return;

    if (mode === 'edit' && category) {
      const start = monthYearParts(category.createdAt);
      const end = lastActiveMonthFromArchived(category.archivedAt);
      setName(category.name);
      setBudgetType(category.budgetType);
      setBudgetValue(String(category.budgetValue));
      setIsFixed(category.isFixed);
      setStartYear(start.year);
      setStartMonthNum(start.month);
      if (end) {
        const endParts = monthYearParts(end);
        setHasEndMonth(true);
        setEndYear(endParts.year);
        setEndMonthNum(endParts.month);
      } else {
        setHasEndMonth(false);
        setEndYear(start.year);
        setEndMonthNum(start.month);
      }
      return;
    }

    const start = monthYearParts(defaultStartMonth ?? monthKey(new Date()));
    setName('');
    setBudgetType('flat');
    setBudgetValue('');
    setIsFixed(false);
    setStartYear(start.year);
    setStartMonthNum(start.month);
    setHasEndMonth(false);
    setEndYear(start.year);
    setEndMonthNum(start.month);
  }, [open, mode, category, defaultStartMonth]);

  const startMonth = monthFromParts(startYear, startMonthNum);
  const endMonth = hasEndMonth ? monthFromParts(endYear, endMonthNum) : undefined;

  const numericValue = Number(budgetValue);
  const dateRangeValid = !hasEndMonth || compareMonths(startMonth, endMonth!) <= 0;

  const percentageAppliesToViewedMonth =
    budgetType === 'percentage' &&
    compareMonths(startMonth, viewedMonth) <= 0 &&
    (!hasEndMonth || compareMonths(viewedMonth, endMonth!) <= 0);

  const percentageValidation =
    budgetType === 'percentage' &&
    Number.isFinite(numericValue) &&
    numericValue >= 0 &&
    percentageAppliesToViewedMonth
      ? validatePercentageAllocation(
          activeCategories,
          viewedMonth,
          numericValue,
          mode === 'edit' ? category?.id : undefined,
        )
      : null;

  const percentageError =
    percentageValidation && !percentageValidation.ok
      ? `Total cannot exceed 100% of the distributable base. You have ${percentageValidation.remaining}% remaining.`
      : null;

  const canSave =
    name.trim() !== '' &&
    Number.isFinite(numericValue) &&
    numericValue >= 0 &&
    dateRangeValid &&
    !percentageError;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      budgetType,
      budgetValue: numericValue,
      isFixed: budgetType === 'flat' ? isFixed : false,
      startMonth,
      endMonth,
    });
    onClose();
  };

  return (
    <ModalShell
      open={open}
      title={mode === 'edit' ? 'Edit category' : 'New category'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={!canSave} onClick={handleSave}>
            {mode === 'edit' ? 'Save' : 'Create'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="label">Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Groceries"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <label className="label">Budget type</label>
          <div className="segmented w-full">
            <button
              type="button"
              data-active={budgetType === 'flat'}
              className="flex-1"
              onClick={() => setBudgetType('flat')}
            >
              Flat amount
            </button>
            <button
              type="button"
              data-active={budgetType === 'percentage'}
              className="flex-1"
              onClick={() => setBudgetType('percentage')}
            >
              Percentage
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="label">
            {budgetType === 'flat' ? 'Amount' : 'Percent of distributable base'}
          </label>
          <input
            className="input"
            inputMode="decimal"
            value={budgetValue}
            onChange={(e) => setBudgetValue(e.target.value)}
            placeholder={budgetType === 'flat' ? '500' : '20'}
          />
          {percentageError ? (
            <p className="text-xs text-danger">{percentageError}</p>
          ) : null}
        </div>
        {budgetType === 'flat' ? (
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={isFixed}
              onChange={(e) => setIsFixed(e.target.checked)}
            />
            Fixed expense (e.g. rent) — subtracted before percentages
          </label>
        ) : null}

        <div className="space-y-2 border-t border-border/80 pt-4">
          <p className="label">Active period</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted">Start month</label>
              <select
                className="input"
                value={startMonthNum}
                onChange={(e) => setStartMonthNum(Number(e.target.value))}
              >
                {MONTH_NAMES.map((label, index) => (
                  <option key={label} value={index + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted">Start year</label>
              <select
                className="input"
                value={startYear}
                onChange={(e) => setStartYear(Number(e.target.value))}
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={hasEndMonth}
              onChange={(e) => setHasEndMonth(e.target.checked)}
            />
            Set end month (for one-time or limited budgets)
          </label>

          {hasEndMonth ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted">End month</label>
                <select
                  className="input"
                  value={endMonthNum}
                  onChange={(e) => setEndMonthNum(Number(e.target.value))}
                >
                  {MONTH_NAMES.map((label, index) => (
                    <option key={label} value={index + 1}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted">End year</label>
                <select
                  className="input"
                  value={endYear}
                  onChange={(e) => setEndYear(Number(e.target.value))}
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          {!dateRangeValid ? (
            <p className="text-xs text-danger">End month must be on or after the start month.</p>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}
