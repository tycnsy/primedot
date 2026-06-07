import { describe, expect, it } from 'vitest';
import type { Account, Transaction } from '../types';
import {
  accountBalance,
  adjustmentDelta,
  balancesByAccount,
  creditUtilization,
  displaySignedAmount,
  netWorth,
  signedAmount,
} from './balances';

function account(partial: Partial<Account> & Pick<Account, 'id' | 'type'>): Account {
  return {
    userId: 'u',
    name: 'Acct',
    sortOrder: 0,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

function txn(partial: Partial<Transaction> & Pick<Transaction, 'accountId' | 'amount' | 'type'>): Transaction {
  return {
    id: Math.random().toString(36),
    userId: 'u',
    date: '2026-01-10',
    budgetOnly: false,
    reimbursable: false,
    reimbursementStatus: 'none',
    createdAt: '2026-01-10T00:00:00Z',
    ...partial,
  };
}

describe('signedAmount', () => {
  it('treats credits as inflow and debits as outflow for asset accounts', () => {
    expect(signedAmount('checking', 'credit', 100)).toBe(100);
    expect(signedAmount('checking', 'debit', 40)).toBe(-40);
  });

  it('treats charges as increasing owed balance for credit accounts', () => {
    expect(signedAmount('credit', 'debit', 100)).toBe(100);
    expect(signedAmount('credit', 'credit', 30)).toBe(-30);
  });

  it('applies adjustments as a signed delta', () => {
    expect(signedAmount('checking', 'adjustment', -25)).toBe(-25);
    expect(signedAmount('credit', 'adjustment', 25)).toBe(25);
  });

  it('ignores budget-only debits', () => {
    expect(signedAmount('checking', 'debit', 40, true)).toBe(0);
  });

  it('applies transfer legs with asset and credit account semantics', () => {
    expect(signedAmount('checking', 'transfer', 100, false, 'out')).toBe(-100);
    expect(signedAmount('savings', 'transfer', 100, false, 'in')).toBe(100);
    expect(signedAmount('credit', 'transfer', 200, false, 'in')).toBe(-200);
    expect(signedAmount('credit', 'transfer', 50, false, 'out')).toBe(50);
  });
});

describe('displaySignedAmount', () => {
  it('inverts credit account amounts for UI display', () => {
    expect(displaySignedAmount('credit', 'debit', 100)).toBe(-100);
    expect(displaySignedAmount('credit', 'credit', 30)).toBe(30);
    expect(displaySignedAmount('checking', 'debit', 40)).toBe(-40);
    expect(displaySignedAmount('checking', 'credit', 100)).toBe(100);
  });

  it('shows budget-only debits as negative regardless of account type', () => {
    expect(displaySignedAmount('credit', 'debit', 40, true)).toBe(-40);
  });

  it('shows credit transfer-in as positive (payment toward owed balance)', () => {
    expect(displaySignedAmount('credit', 'transfer', 200, false, 'in')).toBe(200);
  });
});

describe('accountBalance', () => {
  it('derives a checking balance from the transaction log', () => {
    const acct = account({ id: 'a', type: 'checking' });
    const txns = [
      txn({ accountId: 'a', amount: 1000, type: 'credit' }),
      txn({ accountId: 'a', amount: 250, type: 'debit' }),
      txn({ accountId: 'a', amount: -50, type: 'adjustment' }),
      txn({ accountId: 'b', amount: 999, type: 'credit' }),
    ];
    expect(accountBalance(acct, txns)).toBe(700);
  });

  it('excludes budget-only debits from the derived balance', () => {
    const acct = account({ id: 'a', type: 'checking' });
    const txns = [
      txn({ accountId: 'a', amount: 1000, type: 'credit' }),
      txn({ accountId: 'a', amount: 250, type: 'debit', budgetOnly: true }),
    ];
    expect(accountBalance(acct, txns)).toBe(1000);
  });
});

describe('netWorth', () => {
  it('subtracts credit liabilities from assets', () => {
    const accounts = [
      account({ id: 'a', type: 'checking' }),
      account({ id: 's', type: 'savings' }),
      account({ id: 'c', type: 'credit' }),
    ];
    const txns = [
      txn({ accountId: 'a', amount: 1000, type: 'credit' }),
      txn({ accountId: 's', amount: 500, type: 'credit' }),
      txn({ accountId: 'c', amount: 300, type: 'debit' }),
    ];
    const balances = balancesByAccount(accounts, txns);
    expect(netWorth(accounts, balances)).toEqual({
      assets: 1500,
      liabilities: 300,
      net: 1200,
    });
  });

  it('excludes archived accounts', () => {
    const accounts = [
      account({ id: 'a', type: 'checking' }),
      account({ id: 'old', type: 'savings', archivedAt: '2026-01-01T00:00:00Z' }),
    ];
    const balances = { a: 100, old: 9999 };
    expect(netWorth(accounts, balances).net).toBe(100);
  });

  it('leaves net worth unchanged for asset-to-asset transfers', () => {
    const accounts = [
      account({ id: 'a', type: 'checking' }),
      account({ id: 's', type: 'savings' }),
    ];
    const groupId = 'transfer-group-1';
    const txns = [
      txn({
        accountId: 'a',
        amount: 300,
        type: 'transfer',
        transferGroupId: groupId,
        transferLeg: 'out',
      }),
      txn({
        accountId: 's',
        amount: 300,
        type: 'transfer',
        transferGroupId: groupId,
        transferLeg: 'in',
      }),
      txn({ accountId: 'a', amount: 1000, type: 'credit' }),
    ];
    const balances = balancesByAccount(accounts, txns);
    expect(balances.a).toBe(700);
    expect(balances.s).toBe(300);
    expect(netWorth(accounts, balances).net).toBe(1000);
  });

  it('reduces liabilities when transferring from checking to credit', () => {
    const accounts = [
      account({ id: 'a', type: 'checking' }),
      account({ id: 'c', type: 'credit' }),
    ];
    const groupId = 'transfer-group-2';
    const txns = [
      txn({ accountId: 'a', amount: 1000, type: 'credit' }),
      txn({ accountId: 'c', amount: 500, type: 'debit' }),
      txn({
        accountId: 'a',
        amount: 200,
        type: 'transfer',
        transferGroupId: groupId,
        transferLeg: 'out',
      }),
      txn({
        accountId: 'c',
        amount: 200,
        type: 'transfer',
        transferGroupId: groupId,
        transferLeg: 'in',
      }),
    ];
    const balances = balancesByAccount(accounts, txns);
    expect(balances.a).toBe(800);
    expect(balances.c).toBe(300);
    expect(netWorth(accounts, balances)).toEqual({
      assets: 800,
      liabilities: 300,
      net: 500,
    });
  });
});

describe('adjustmentDelta', () => {
  it('returns the signed delta to reach a target balance', () => {
    expect(adjustmentDelta(700, 1000)).toBe(300);
    expect(adjustmentDelta(700, 500)).toBe(-200);
  });
});

describe('creditUtilization', () => {
  it('computes utilization against the limit', () => {
    const acct = account({ id: 'c', type: 'credit', creditLimit: 1000 });
    expect(creditUtilization(acct, 250)).toBe(0.25);
  });

  it('returns null without a limit', () => {
    const acct = account({ id: 'c', type: 'credit' });
    expect(creditUtilization(acct, 250)).toBeNull();
  });
});
