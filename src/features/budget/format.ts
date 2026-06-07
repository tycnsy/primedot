/** Currency + percentage formatting for the budgeting module. */

export function formatMoney(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Compact signed money (e.g. "+$120.00" / "-$40.00") for deltas. */
export function formatSignedMoney(amount: number, currency = 'USD'): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${sign}${formatMoney(Math.abs(amount), currency)}`;
}

export function formatPercent(ratio: number, fractionDigits = 0): string {
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}

/** Short month label for earned month (e.g. "Jan 2026"). */
export function formatEarnedMonth(earnedMonth: string): string {
  const d = new Date(`${earnedMonth.slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(d);
}

/**
 * Human-friendly date (e.g. "June 22"), with year included for non-current years.
 */
export function formatDisplayDate(isoDay: string, now = new Date()): string {
  const [year, month, day] = isoDay.split('-').map(Number);
  if (!year || !month || !day) return isoDay;

  const date = new Date(year, month - 1, day);
  const includeYear = year !== now.getFullYear();

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(date);
}
