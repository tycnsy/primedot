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
}

const CURRENCY_KEY = 'prime:budget:currency';
const STRATEGY_KEY = 'prime:budget:payoff-strategy';
const MODE_KEY = 'prime:budget:payoff-mode';
const INCOME_MODE_KEY = 'prime:budget:income-mode';

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

  useEffect(() => writeStorage(CURRENCY_KEY, currency), [currency]);
  useEffect(() => writeStorage(STRATEGY_KEY, payoffStrategy), [payoffStrategy]);
  useEffect(() => writeStorage(MODE_KEY, payoffMode), [payoffMode]);
  useEffect(() => writeStorage(INCOME_MODE_KEY, incomeMode), [incomeMode]);

  const setCurrency = useCallback((value: string) => setCurrencyState(value), []);
  const setPayoffStrategy = useCallback(
    (value: PayoffStrategy) => setPayoffStrategyState(value),
    [],
  );
  const setPayoffMode = useCallback((value: PayoffMode) => setPayoffModeState(value), []);
  const setIncomeMode = useCallback((value: IncomeMode) => setIncomeModeState(value), []);

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
    }),
    [
      currency,
      incomeMode,
      payoffMode,
      payoffStrategy,
      setCurrency,
      setIncomeMode,
      setPayoffMode,
      setPayoffStrategy,
    ],
  );
}
