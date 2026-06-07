import { useEffect, useMemo, useRef, useState } from 'react';
import BudgetHeader from '../components/budget/BudgetHeader';
import PeriodSelector from '../components/budget/PeriodSelector';
import CategoryRow from '../components/budget/CategoryRow';
import AddCategoryModal from '../components/budget/AddCategoryModal';
import {
  archivedAtFromEndMonth,
  carryOverForTargetMonth,
  compareMonths,
  computeMonthlyBudget,
  formatMoney,
  isCategoryActiveInMonth,
  percentageAllocationTotal,
  lastActiveMonthFromArchived,
  monthKey,
  netCarryOver,
  previousMonth,
  remapBranchCarryOver,
  shouldBranchCategoryAtMonth,
  validatePercentageAllocation,
  useBudgetPeriods,
  useBudgetPreferences,
  useCategories,
  useIncome,
  useTransactions,
} from '../features/budget';
import type { Category, NewCategoryInput } from '../features/budget';

function monthRangeLabel(category: Category): string | null {
  const end = lastActiveMonthFromArchived(category.archivedAt);
  if (!end) return null;
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });
  const startLabel = fmt.format(new Date(`${monthKey(category.createdAt)}T00:00:00`));
  const endLabel = fmt.format(new Date(`${monthKey(end)}T00:00:00`));
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

export default function BudgetCategories() {
  const { currency, incomeMode, setIncomeMode } = useBudgetPreferences();
  const {
    allCategories,
    createCategory,
    updateCategory,
    branchCategory,
    deleteCategory,
    reorderCategories,
  } = useCategories();
  const { transactions } = useTransactions();
  const { incomeEntries } = useIncome();
  const { periodsByMonth, setCarryOver } = useBudgetPeriods();

  const currentMonth = monthKey(new Date());
  const [month, setMonth] = useState(currentMonth);
  const [addOpen, setAddOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const persistedMonths = useRef<Set<string>>(new Set());

  const isPast = compareMonths(month, currentMonth) < 0;
  const isFuture = compareMonths(month, currentMonth) > 0;
  const valueEditable = !isPast;
  const planEditable = !isPast;

  const previous = previousMonth(month);
  const previousPeriodExists = !!periodsByMonth[monthKey(previous)];
  const prevIsFuture = compareMonths(previous, currentMonth) > 0;

  const categories = useMemo(
    () => allCategories.filter((category) => isCategoryActiveInMonth(category, month)),
    [allCategories, month],
  );

  const previousCategories = useMemo(
    () => allCategories.filter((category) => isCategoryActiveInMonth(category, previous)),
    [allCategories, previous],
  );

  const categoryById = useMemo(
    () => new Map(allCategories.map((category) => [category.id, category])),
    [allCategories],
  );

  const prevBudget = useMemo(
    () =>
      computeMonthlyBudget({
        month: previousMonth(month),
        categories: previousCategories,
        incomeEntries,
        transactions,
        incomeMode,
        isFutureMonth: prevIsFuture,
      }),
    [incomeEntries, incomeMode, month, prevIsFuture, previousCategories, transactions],
  );

  const carryMap = useMemo(() => {
    if (!previousPeriodExists) return {};
    const raw = carryOverForTargetMonth(prevBudget, month, currentMonth);
    return remapBranchCarryOver(raw, month, categories, allCategories);
  }, [allCategories, categories, currentMonth, month, prevBudget, previousPeriodExists]);

  const budget = useMemo(
    () =>
      computeMonthlyBudget({
        month,
        categories,
        incomeEntries,
        transactions,
        carryOverByCategory: carryMap,
        incomeMode,
        isFutureMonth: isFuture,
      }),
    [carryMap, categories, incomeEntries, incomeMode, isFuture, month, transactions],
  );

  // Lazily persist the net carry-over onto the period record the first time a
  // month is opened (the schema stores the net on budget_periods).
  useEffect(() => {
    const key = monthKey(month);
    if (persistedMonths.current.has(key)) return;
    if (periodsByMonth[key]) {
      persistedMonths.current.add(key);
      return;
    }
    const net = netCarryOver(prevBudget);
    if (!previousPeriodExists) {
      persistedMonths.current.add(key);
      return;
    }
    if (net !== 0) {
      persistedMonths.current.add(key);
      void setCarryOver(month, net);
    }
  }, [month, periodsByMonth, prevBudget, previousPeriodExists, setCarryOver]);

  const percentAllocated = percentageAllocationTotal(categories, month);
  const percentRemaining = 100 - percentAllocated;

  const percentageValueError = (categoryId: string, value: number): string | null => {
    const result = validatePercentageAllocation(categories, month, value, categoryId);
    return result.ok
      ? null
      : `Total cannot exceed 100% of the distributable base. You have ${result.remaining}% remaining.`;
  };

  const orderedCategories = useMemo(() => {
    const byId = new Map(budget.categories.map((c) => [c.categoryId, c]));
    return categories
      .map((category) => byId.get(category.id))
      .filter((value): value is NonNullable<typeof value> => !!value);
  }, [budget.categories, categories]);

  const handleDrop = (targetId: string) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    const ids = categories.map((c) => c.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) {
      setDraggedId(null);
      return;
    }
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const visible = new Set(next);
    const merged = allCategories.map((category) => category.id);
    let pointer = 0;
    for (let i = 0; i < merged.length; i += 1) {
      if (!visible.has(merged[i])) continue;
      merged[i] = next[pointer];
      pointer += 1;
    }
    setDraggedId(null);
    void reorderCategories(merged);
  };

  const handleCreate = (input: NewCategoryInput) => {
    if (input.budgetType === 'percentage') {
      const result = validatePercentageAllocation(categories, month, input.budgetValue);
      if (!result.ok) return;
    }
    void createCategory(input, month);
  };

  const handleEdit = (input: NewCategoryInput) => {
    if (!editingCategory) return;
    if (input.budgetType === 'percentage') {
      const result = validatePercentageAllocation(
        categories,
        month,
        input.budgetValue,
        editingCategory.id,
      );
      if (!result.ok) return;
    }
    if (isFuture && shouldBranchCategoryAtMonth(editingCategory, month)) {
      void branchCategory(editingCategory, month, {
        ...input,
        startMonth: month,
      });
    } else {
      void updateCategory(editingCategory.id, {
        name: input.name,
        budgetType: input.budgetType,
        budgetValue: input.budgetValue,
        isFixed: input.isFixed,
        createdAt: input.startMonth
          ? `${monthKey(input.startMonth)}T00:00:00.000Z`
          : editingCategory.createdAt,
        archivedAt: input.endMonth ? archivedAtFromEndMonth(input.endMonth) : null,
      });
    }
    setEditingCategory(null);
  };

  const handleValueChange = (category: Category, value: number) => {
    if (value === category.budgetValue) return;
    if (category.budgetType === 'percentage') {
      const result = validatePercentageAllocation(categories, month, value, category.id);
      if (!result.ok) return;
    }
    if (isFuture && shouldBranchCategoryAtMonth(category, month)) {
      void branchCategory(category, month, {
        name: category.name,
        budgetType: category.budgetType,
        budgetValue: value,
        isFixed: category.isFixed,
        startMonth: month,
      });
      return;
    }
    void updateCategory(category.id, { budgetValue: value });
  };

  return (
    <div className="space-y-6">
      <BudgetHeader
        title="Budget"
        subtitle="Plan categories and track spending for the month."
        actions={
          planEditable ? (
            <button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>
              + Category
            </button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector month={month} currentMonth={currentMonth} onChange={setMonth} />
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted">Income basis</span>
          <div className="segmented">
            <button
              type="button"
              data-active={incomeMode === 'expected'}
              onClick={() => setIncomeMode('expected')}
            >
              Expected
            </button>
            <button
              type="button"
              data-active={incomeMode === 'received'}
              onClick={() => setIncomeMode('received')}
            >
              Received
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label="Income" value={formatMoney(budget.totalIncome, currency)} />
        <SummaryStat label="Fixed" value={formatMoney(budget.fixedTotal, currency)} />
        <SummaryStat
          label="Distributable"
          value={formatMoney(budget.distributableBase, currency)}
          danger={isFuture && budget.distributableBase < 0}
        />
        <SummaryStat
          label="Remaining"
          value={formatMoney(budget.totalRemaining, currency)}
          danger={budget.totalRemaining < 0}
        />
      </div>

      {planEditable && percentRemaining > 0 ? (
        <div className="card border-border/80 bg-surface2/40">
          <p className="text-sm text-fg">
            <span className="font-semibold tabular-nums">{percentRemaining}%</span> of the
            distributable base is unallocated. Add or adjust percentage categories to allocate the
            remaining amount.
          </p>
        </div>
      ) : null}

      {orderedCategories.length === 0 ? (
        <div className="card">
          <p className="text-sm text-muted">
            No categories yet. Add flat (fixed) and percentage categories to build your budget.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {orderedCategories.map((categoryBudget) => {
            const source = categoryById.get(categoryBudget.categoryId);
            return (
              <CategoryRow
                key={categoryBudget.categoryId}
                budget={categoryBudget}
                currency={currency}
                valueEditable={valueEditable}
                planEditable={planEditable}
                dateRangeLabel={source ? monthRangeLabel(source) : null}
                draggable={planEditable}
                isDragging={draggedId === categoryBudget.categoryId}
                onChangeValue={(value) => {
                  const cat = categoryById.get(categoryBudget.categoryId);
                  if (cat) handleValueChange(cat, value);
                }}
                validateValue={
                  categoryBudget.budgetType === 'percentage'
                    ? (value) => percentageValueError(categoryBudget.categoryId, value)
                    : undefined
                }
                onEdit={() => {
                  const cat = categoryById.get(categoryBudget.categoryId);
                  if (cat) setEditingCategory(cat);
                }}
                onDelete={() => {
                  if (window.confirm(`Delete ${categoryBudget.name}?`))
                    deleteCategory(categoryBudget.categoryId, month);
                }}
                onDragStart={() => setDraggedId(categoryBudget.categoryId)}
                onDragOver={() => undefined}
                onDrop={() => handleDrop(categoryBudget.categoryId)}
                onDragEnd={() => setDraggedId(null)}
              />
            );
          })}
        </div>
      )}

      <AddCategoryModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={handleCreate}
        defaultStartMonth={month}
        viewedMonth={month}
        activeCategories={categories}
      />

      <AddCategoryModal
        open={!!editingCategory}
        onClose={() => setEditingCategory(null)}
        onSave={handleEdit}
        mode="edit"
        category={editingCategory}
        defaultStartMonth={month}
        viewedMonth={month}
        activeCategories={categories}
      />
    </div>
  );
}

function SummaryStat({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="card">
      <p className="label">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${danger ? 'text-danger' : 'text-fg'}`}>
        {value}
      </p>
    </div>
  );
}
