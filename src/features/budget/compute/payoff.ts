import type { Account } from '../types';

export type PayoffStrategy = 'avalanche' | 'snowball';
export type PayoffMode = 'minimumOnly' | 'fixedExtra';

export interface AmortizationRow {
  month: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

export interface PayoffResult {
  months: number;
  totalInterest: number;
  totalPaid: number;
  schedule: AmortizationRow[];
  /** True when the payment never covers monthly interest (never pays off). */
  neverPaysOff: boolean;
}

export interface ComputePayoffArgs {
  balance: number;
  apr: number;
  monthlyPayment: number;
  maxMonths?: number;
}

const DEFAULT_MAX_MONTHS = 1200;

/** Computes months-to-payoff, total interest and a full amortization schedule. */
export function computePayoff({
  balance,
  apr,
  monthlyPayment,
  maxMonths = DEFAULT_MAX_MONTHS,
}: ComputePayoffArgs): PayoffResult {
  const empty: PayoffResult = {
    months: 0,
    totalInterest: 0,
    totalPaid: 0,
    schedule: [],
    neverPaysOff: false,
  };
  if (balance <= 0) return empty;

  const monthlyRate = apr / 100 / 12;
  const firstInterest = balance * monthlyRate;
  if (monthlyPayment <= firstInterest && monthlyRate > 0) {
    return { ...empty, neverPaysOff: true };
  }

  const schedule: AmortizationRow[] = [];
  let remaining = balance;
  let totalInterest = 0;
  let totalPaid = 0;
  let month = 0;

  while (remaining > 0 && month < maxMonths) {
    month += 1;
    const interest = remaining * monthlyRate;
    let principal = monthlyPayment - interest;
    let payment = monthlyPayment;
    if (principal >= remaining) {
      principal = remaining;
      payment = remaining + interest;
    }
    remaining = Math.max(0, remaining - principal);
    totalInterest += interest;
    totalPaid += payment;
    schedule.push({
      month,
      payment: Number(payment.toFixed(2)),
      interest: Number(interest.toFixed(2)),
      principal: Number(principal.toFixed(2)),
      balance: Number(remaining.toFixed(2)),
    });
  }

  return {
    months: month,
    totalInterest: Number(totalInterest.toFixed(2)),
    totalPaid: Number(totalPaid.toFixed(2)),
    schedule,
    neverPaysOff: false,
  };
}

/** Resolves the monthly payment for a given mode/account. */
export function paymentForMode(
  account: Account,
  mode: PayoffMode,
  extra = 0,
): number {
  const minimum = account.minimumPayment ?? 0;
  return mode === 'minimumOnly' ? minimum : minimum + extra;
}

export interface PayoffAccount {
  account: Account;
  balance: number;
}

/**
 * Orders credit accounts for a multi-debt payoff strategy:
 * - avalanche: highest APR first
 * - snowball: lowest balance first
 */
export function orderAccounts(
  accounts: PayoffAccount[],
  strategy: PayoffStrategy,
): PayoffAccount[] {
  const sorted = [...accounts];
  if (strategy === 'avalanche') {
    sorted.sort((a, b) => (b.account.apr ?? 0) - (a.account.apr ?? 0));
  } else {
    sorted.sort((a, b) => a.balance - b.balance);
  }
  return sorted;
}
