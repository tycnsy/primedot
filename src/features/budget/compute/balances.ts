import type { Account, AccountType, Transaction, TransferLeg } from '../types';

/**
 * Returns the signed effect of a transaction on its account's balance.
 *
 * Sign conventions:
 * - Asset accounts (checking/savings): credit adds, debit subtracts.
 * - Credit accounts (balance represents amount owed): a debit (charge) raises
 *   the owed balance, a credit (payment/refund) lowers it.
 * - Transfers use out/in legs with the same semantics as debit/credit per side.
 * - Adjustments carry a signed delta and apply directly in both cases.
 * - Budget-only debits are excluded from balance math.
 */
export function signedAmount(
  accountType: AccountType,
  type: Transaction['type'],
  amount: number,
  budgetOnly = false,
  transferLeg?: TransferLeg,
): number {
  if (budgetOnly) return 0;
  if (type === 'adjustment') return amount;
  if (type === 'transfer') {
    const isOut = transferLeg === 'out';
    if (accountType === 'credit') return isOut ? amount : -amount;
    return isOut ? -amount : amount;
  }
  if (accountType === 'credit') {
    return type === 'debit' ? amount : -amount;
  }
  return type === 'credit' ? amount : -amount;
}

/**
 * Returns the signed amount to display in the UI. Credit accounts invert the
 * balance effect so charges read as negative (red) and payments as positive.
 */
export function displaySignedAmount(
  accountType: AccountType,
  type: Transaction['type'],
  amount: number,
  budgetOnly = false,
  transferLeg?: TransferLeg,
): number {
  if (budgetOnly) return -amount;
  const balanceEffect = signedAmount(accountType, type, amount, budgetOnly, transferLeg);
  return accountType === 'credit' ? -balanceEffect : balanceEffect;
}

/** Derives an account's current balance from its transaction log. */
export function accountBalance(account: Account, transactions: Transaction[]): number {
  return transactions.reduce((sum, txn) => {
    if (txn.accountId !== account.id) return sum;
    return sum + signedAmount(account.type, txn.type, txn.amount, txn.budgetOnly, txn.transferLeg);
  }, 0);
}

/** Builds a map of accountId -> derived balance for the given accounts. */
export function balancesByAccount(
  accounts: Account[],
  transactions: Transaction[],
): Record<string, number> {
  const byAccount: Record<string, number> = {};
  for (const account of accounts) byAccount[account.id] = 0;
  for (const txn of transactions) {
    const account = accounts.find((item) => item.id === txn.accountId);
    if (!account) continue;
    byAccount[account.id] += signedAmount(
      account.type,
      txn.type,
      txn.amount,
      txn.budgetOnly,
      txn.transferLeg,
    );
  }
  return byAccount;
}

export interface NetWorth {
  assets: number;
  liabilities: number;
  net: number;
}

/**
 * Net worth = asset balances minus credit (liability) balances.
 * Credit account balances represent debt and are subtracted.
 */
export function netWorth(
  accounts: Account[],
  balances: Record<string, number>,
): NetWorth {
  let assets = 0;
  let liabilities = 0;
  for (const account of accounts) {
    if (account.archivedAt) continue;
    const balance = balances[account.id] ?? 0;
    if (account.type === 'credit') liabilities += balance;
    else assets += balance;
  }
  return { assets, liabilities, net: assets - liabilities };
}

/**
 * Computes the signed adjustment delta needed to move an account's derived
 * balance to a target value. The result is stored as an `adjustment` txn.
 */
export function adjustmentDelta(currentBalance: number, targetBalance: number): number {
  return Number((targetBalance - currentBalance).toFixed(2));
}

/** Credit utilization (0-1) for a credit account, or null when no limit set. */
export function creditUtilization(
  account: Account,
  owedBalance: number,
): number | null {
  if (account.type !== 'credit' || !account.creditLimit || account.creditLimit <= 0) {
    return null;
  }
  return owedBalance / account.creditLimit;
}
