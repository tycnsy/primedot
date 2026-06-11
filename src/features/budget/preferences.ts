import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PayoffMode, PayoffStrategy } from './compute/payoff';
import type { IncomeMode } from './compute/budgetMath';

interface BudgetPreferences {
  currency: string;
  setCurrency: (currency: string) => void;
  payoffStrategy: PayoffStrategy;
  setPayoffStrategy: (strategy: PayoffStrategy) => void;
  payoffMode: PayoffMode;
  setPayoffMode: (mode: PayoffMode) => void;
  incomeMode: IncomeMode;
  setIncomeMode: (mode: IncomeMode) => void;
  hiddenSpendingCategoryIds: string[];
  hideSpendingCategory: (categoryId: string) => void;
  showSpendingCategory: (categoryId: string) => void;
  toggleSpendingCategoryHidden: (categoryId: string) => void;
  hiddenBudgetTabIds: string[];
  hideBudgetTab: (tabId: string) => void;
  showBudgetTab: (tabId: string) => void;
  toggleBudgetTabHidden: (tabId: string) => void;
}

const CURRENCY_KEY = 'prime:budget:currency';
const STRATEGY_KEY = 'prime:budget:payoff-strategy';
const MODE_KEY = 'prime:budget:payoff-mode';
const INCOME_MODE_KEY = 'prime:budget:income-mode';
const HIDDEN_SPENDING_KEY = 'prime:budget:spending-hidden-categories';
const HIDDEN_TABS_KEY = 'prime:budget:hidden-tabs';

function readStringArray(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function readStorage<T extends string>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return (value as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage write failures
  }
}

export function useBudgetPreferences(): BudgetPreferences {
  const [currency, setCurrencyState] = useState<string>(() =>
    readStorage(CURRENCY_KEY, 'USD'),
  );
  const [payoffStrategy, setPayoffStrategyState] = useState<PayoffStrategy>(() =>
    readStorage<PayoffStrategy>(STRATEGY_KEY, 'avalanche'),
  );
  const [payoffMode, setPayoffModeState] = useState<PayoffMode>(() =>
    readStorage<PayoffMode>(MODE_KEY, 'minimumOnly'),
  );
  const [incomeMode, setIncomeModeState] = useState<IncomeMode>(() =>
    readStorage<IncomeMode>(INCOME_MODE_KEY, 'expected'),
  );
  const [hiddenSpendingCategoryIds, setHiddenSpendingCategoryIds] = useState<string[]>(() =>
    readStringArray(HIDDEN_SPENDING_KEY),
  );
  const [hiddenBudgetTabIds, setHiddenBudgetTabIds] = useState<string[]>(() =>
    readStringArray(HIDDEN_TABS_KEY),
  );

  useEffect(() => writeStorage(CURRENCY_KEY, currency), [currency]);
  useEffect(() => writeStorage(STRATEGY_KEY, payoffStrategy), [payoffStrategy]);
  useEffect(() => writeStorage(MODE_KEY, payoffMode), [payoffMode]);
  useEffect(() => writeStorage(INCOME_MODE_KEY, incomeMode), [incomeMode]);
  useEffect(
    () => writeStorage(HIDDEN_SPENDING_KEY, JSON.stringify(hiddenSpendingCategoryIds)),
    [hiddenSpendingCategoryIds],
  );
  useEffect(
    () => writeStorage(HIDDEN_TABS_KEY, JSON.stringify(hiddenBudgetTabIds)),
    [hiddenBudgetTabIds],
  );

  const setCurrency = useCallback((value: string) => setCurrencyState(value), []);
  const setPayoffStrategy = useCallback(
    (value: PayoffStrategy) => setPayoffStrategyState(value),
    [],
  );
  const setPayoffMode = useCallback((value: PayoffMode) => setPayoffModeState(value), []);
  const setIncomeMode = useCallback((value: IncomeMode) => setIncomeModeState(value), []);

  const hideSpendingCategory = useCallback((categoryId: string) => {
    setHiddenSpendingCategoryIds((prev) =>
      prev.includes(categoryId) ? prev : [...prev, categoryId],
    );
  }, []);

  const showSpendingCategory = useCallback((categoryId: string) => {
    setHiddenSpendingCategoryIds((prev) => prev.filter((id) => id !== categoryId));
  }, []);

  const toggleSpendingCategoryHidden = useCallback((categoryId: string) => {
    setHiddenSpendingCategoryIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId],
    );
  }, []);

  const hideBudgetTab = useCallback((tabId: string) => {
    setHiddenBudgetTabIds((prev) => (prev.includes(tabId) ? prev : [...prev, tabId]));
  }, []);

  const showBudgetTab = useCallback((tabId: string) => {
    setHiddenBudgetTabIds((prev) => prev.filter((id) => id !== tabId));
  }, []);

  const toggleBudgetTabHidden = useCallback((tabId: string) => {
    setHiddenBudgetTabIds((prev) =>
      prev.includes(tabId) ? prev.filter((id) => id !== tabId) : [...prev, tabId],
    );
  }, []);

  return useMemo(
    () => ({
      currency,
      setCurrency,
      payoffStrategy,
      setPayoffStrategy,
      payoffMode,
      setPayoffMode,
      incomeMode,
      setIncomeMode,
      hiddenSpendingCategoryIds,
      hideSpendingCategory,
      showSpendingCategory,
      toggleSpendingCategoryHidden,
      hiddenBudgetTabIds,
      hideBudgetTab,
      showBudgetTab,
      toggleBudgetTabHidden,
    }),
    [
      currency,
      hiddenBudgetTabIds,
      hiddenSpendingCategoryIds,
      hideBudgetTab,
      hideSpendingCategory,
      incomeMode,
      payoffMode,
      payoffStrategy,
      setCurrency,
      setIncomeMode,
      setPayoffMode,
      setPayoffStrategy,
      showBudgetTab,
      showSpendingCategory,
      toggleBudgetTabHidden,
      toggleSpendingCategoryHidden,
    ],
  );
}
