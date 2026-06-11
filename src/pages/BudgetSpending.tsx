import { useEffect, useMemo, useState } from 'react';
import BudgetHeader from '../components/budget/BudgetHeader';
import PeriodSelector from '../components/budget/PeriodSelector';
import DailySpendingRow from '../components/budget/DailySpendingRow';
import HiddenSpendingSection from '../components/budget/HiddenSpendingSection';
import {
  addDays,
  carryOverForTargetMonth,
  compareMonths,
  computeDailySpendingView,
  computeMonthlyBudget,
  formatDisplayDate,
  formatMoney,
  isCategoryActiveInMonth,
  isDayInMonth,
  monthBounds,
  monthKey,
  previousMonth,
  remapBranchCarryOver,
  spendingComparisonDate,
  todayInBudgetTimeZone,
  useBudgetPeriods,
  useBudgetPreferences,
  useCategories,
  useIncome,
  useTransactions,
} from '../features/budget';

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

export default function BudgetSpending() {
  const {
    currency,
    incomeMode,
    setIncomeMode,
    hiddenSpendingCategoryIds,
    hideSpendingCategory,
    showSpendingCategory,
  } = useBudgetPreferences();
  const { allCategories } = useCategories();
  const { transactions } = useTransactions();
  const { incomeEntries } = useIncome();
  const { periodsByMonth } = useBudgetPeriods();

  const todayEst = todayInBudgetTimeZone();
  const currentMonth = monthKey(todayEst);
  const [month, setMonth] = useState(currentMonth);

  const defaultDay = useMemo(
    () => spendingComparisonDate(month, currentMonth, todayEst),
    [month, currentMonth, todayEst],
  );

  const [selectedDay, setSelectedDay] = useState<string | null>(defaultDay);

  useEffect(() => {
    setSelectedDay(defaultDay);
  }, [defaultDay]);

  const isFuture = compareMonths(month, currentMonth) > 0;
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

  const prevBudget = useMemo(
    () =>
      computeMonthlyBudget({
        month: previous,
        categories: previousCategories,
        incomeEntries,
        transactions,
        incomeMode,
        isFutureMonth: prevIsFuture,
      }),
    [incomeEntries, incomeMode, previous, prevIsFuture, previousCategories, transactions],
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

  const orderedCategoryBudgets = useMemo(() => {
    const byId = new Map(budget.categories.map((c) => [c.categoryId, c]));
    return categories
      .map((category) => byId.get(category.id))
      .filter((value): value is NonNullable<typeof value> => !!value);
  }, [budget.categories, categories]);

  const dailyView = useMemo(() => {
    if (!selectedDay || !isDayInMonth(selectedDay, month)) return null;
    return computeDailySpendingView({
      month,
      selectedDay,
      categoryBudgets: orderedCategoryBudgets,
      transactions,
    });
  }, [month, orderedCategoryBudgets, selectedDay, transactions]);

  const hiddenSet = useMemo(
    () => new Set(hiddenSpendingCategoryIds),
    [hiddenSpendingCategoryIds],
  );

  const visibleCategories = useMemo(
    () => dailyView?.categories.filter((c) => !hiddenSet.has(c.categoryId)) ?? [],
    [dailyView, hiddenSet],
  );

  const hiddenCategories = useMemo(
    () => dailyView?.categories.filter((c) => hiddenSet.has(c.categoryId)) ?? [],
    [dailyView, hiddenSet],
  );

  const { start, end } = monthBounds(month);
  const canGoPrevDay = selectedDay != null && selectedDay > start;
  const canGoNextDay = selectedDay != null && selectedDay < end && selectedDay < (defaultDay ?? end);

  const goPrevDay = () => {
    if (!selectedDay || !canGoPrevDay) return;
    setSelectedDay(addDays(selectedDay, -1));
  };

  const goNextDay = () => {
    if (!selectedDay || !canGoNextDay) return;
    setSelectedDay(addDays(selectedDay, 1));
  };

  return (
    <div className="space-y-6">
      <BudgetHeader
        title="Spending"
        subtitle="Daily budget pacing with rollover. Days advance at midnight Eastern."
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

      {isFuture ? (
        <div className="card">
          <p className="text-sm text-muted">
            Daily spending is available once the month begins.
          </p>
        </div>
      ) : selectedDay ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-ghost !px-2 !py-1"
                onClick={goPrevDay}
                disabled={!canGoPrevDay}
                aria-label="Previous day"
              >
                ←
              </button>
              <p className="text-sm font-medium text-fg">
                {formatDisplayDate(selectedDay)}
              </p>
              <button
                type="button"
                className="btn-ghost !px-2 !py-1"
                onClick={goNextDay}
                disabled={!canGoNextDay}
                aria-label="Next day"
              >
                →
              </button>
            </div>
            {selectedDay === todayEst && monthKey(month) === currentMonth ? (
              <span className="pill text-[10px]">Today (EST)</span>
            ) : null}
          </div>

          {dailyView ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <SummaryStat
                  label="Available"
                  value={formatMoney(dailyView.totalAvailable, currency)}
                  danger={dailyView.totalAvailable < 0}
                />
                <SummaryStat
                  label="Spent today"
                  value={formatMoney(dailyView.totalSpentToday, currency)}
                />
                <SummaryStat
                  label="Over pace"
                  value={String(dailyView.categoriesOverPace)}
                  danger={dailyView.categoriesOverPace > 0}
                />
              </div>

              {visibleCategories.length === 0 && hiddenCategories.length === 0 ? (
                <div className="card">
                  <p className="text-sm text-muted">
                    No categories for this month. Add categories on the Budget tab.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {visibleCategories.map((state) => (
                    <DailySpendingRow
                      key={state.categoryId}
                      state={state}
                      currency={currency}
                      onToggleHidden={() => hideSpendingCategory(state.categoryId)}
                      hiddenActionLabel="Hide"
                    />
                  ))}
                </div>
              )}

              <HiddenSpendingSection
                categories={hiddenCategories}
                currency={currency}
                onShow={showSpendingCategory}
              />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
