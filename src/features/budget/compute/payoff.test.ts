import { describe, expect, it } from 'vitest';
import type { Account } from '../types';
import { computePayoff, orderAccounts, paymentForMode } from './payoff';

function creditAccount(partial: Partial<Account> & Pick<Account, 'id'>): Account {
  return {
    userId: 'u',
    name: 'Card',
    type: 'credit',
    sortOrder: 0,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('computePayoff', () => {
  it('pays off a zero-interest balance in even installments', () => {
    const result = computePayoff({ balance: 1000, apr: 0, monthlyPayment: 250 });
    expect(result.months).toBe(4);
    expect(result.totalInterest).toBe(0);
    expect(result.totalPaid).toBe(1000);
  });

  it('accrues interest and still pays off', () => {
    const result = computePayoff({ balance: 1000, apr: 24, monthlyPayment: 100 });
    expect(result.neverPaysOff).toBe(false);
    expect(result.months).toBeGreaterThan(10);
    expect(result.totalInterest).toBeGreaterThan(0);
    expect(result.schedule[result.schedule.length - 1].balance).toBe(0);
  });

  it('flags a payment that never covers interest', () => {
    const result = computePayoff({ balance: 1000, apr: 24, monthlyPayment: 5 });
    expect(result.neverPaysOff).toBe(true);
  });

  it('returns empty for a zero balance', () => {
    expect(computePayoff({ balance: 0, apr: 20, monthlyPayment: 100 }).months).toBe(0);
  });
});

describe('paymentForMode', () => {
  it('uses minimum only or minimum plus extra', () => {
    const acct = creditAccount({ id: 'c', minimumPayment: 50 });
    expect(paymentForMode(acct, 'minimumOnly')).toBe(50);
    expect(paymentForMode(acct, 'fixedExtra', 100)).toBe(150);
  });
});

describe('orderAccounts', () => {
  const a = creditAccount({ id: 'a', apr: 12 });
  const b = creditAccount({ id: 'b', apr: 24 });
  const c = creditAccount({ id: 'c', apr: 18 });
  const list = [
    { account: a, balance: 500 },
    { account: b, balance: 2000 },
    { account: c, balance: 100 },
  ];

  it('avalanche orders by highest APR', () => {
    expect(orderAccounts(list, 'avalanche').map((x) => x.account.id)).toEqual(['b', 'c', 'a']);
  });

  it('snowball orders by lowest balance', () => {
    expect(orderAccounts(list, 'snowball').map((x) => x.account.id)).toEqual(['c', 'a', 'b']);
  });
});
