// prime. — Budgeting module domain + DB row types

export type AccountType = 'checking' | 'savings' | 'credit';
export type TransactionType = 'debit' | 'credit' | 'adjustment' | 'transfer';
export type TransferLeg = 'out' | 'in';
export type CategoryType = 'flat' | 'percentage';
export type IncomeStatus = 'expected' | 'received';
export type ReimbursementStatus = 'none' | 'pending' | 'received';

// ---------------------------------------------------------------------------
// Domain types (camelCase, used throughout the UI/compute layer)
// ---------------------------------------------------------------------------

export interface Account {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  creditLimit?: number;
  apr?: number;
  minimumPayment?: number;
  payoffTargetDate?: string;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
}

export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  categoryId?: string;
  amount: number;
  date: string;
  type: TransactionType;
  /** Counts toward category spend but not account balance when true. */
  budgetOnly: boolean;
  reimbursable: boolean;
  reimbursementStatus: ReimbursementStatus;
  reimbursedById?: string;
  transferGroupId?: string;
  transferLeg?: TransferLeg;
  note?: string;
  createdAt: string;
}

export interface Category {
  id: string;
  userId: string;
  name: string;
  budgetType: CategoryType;
  budgetValue: number;
  isFixed: boolean;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
}

export interface BudgetPeriod {
  id: string;
  userId: string;
  month: string; // first of month, YYYY-MM-DD
  carryOverAmount: number;
  createdAt: string;
}

export interface IncomeEntry {
  id: string;
  userId: string;
  sourceName: string;
  amount: number;
  expectedDate: string;
  /** First of month when income was earned (YYYY-MM-01). */
  earnedMonth: string;
  status: IncomeStatus;
  receivedDate?: string;
  updatedAt?: string;
  createdAt: string;
}

export interface MonthlyEarningsSnapshot {
  id: string;
  userId: string;
  earnedMonth: string;
  totalAmount: number;
  note?: string;
  recordedAt: string;
}

export interface MonthlyEarningsGoal {
  id: string;
  userId: string;
  earnedMonth: string;
  goalAmount: number;
}

export interface IncomeAdjustment {
  id: string;
  incomeEntryId: string;
  oldAmount: number;
  newAmount: number;
  adjustedAt: string;
}

export interface IncomeAdjustmentRow {
  id: string;
  user_id: string;
  income_entry_id: string;
  source_name: string;
  old_amount: number;
  new_amount: number;
  old_expected_date: string;
  new_expected_date: string;
  old_status: IncomeStatus;
  new_status: IncomeStatus;
  old_received_date: string | null;
  new_received_date: string | null;
  adjusted_at: string;
}

export interface SavingsGoal {
  id: string;
  userId: string;
  name: string;
  targetAmount: number;
  targetDate?: string;
  linkedAccountId?: string;
  contributedAmount: number;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// DB row types (snake_case, mirror the Supabase tables)
// ---------------------------------------------------------------------------

export interface AccountRow {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  credit_limit: number | null;
  apr: number | null;
  minimum_payment: number | null;
  payoff_target_date: string | null;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
}

export interface TransactionRow {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  amount: number;
  date: string;
  type: TransactionType;
  reimbursable: boolean;
  reimbursement_status: ReimbursementStatus;
  reimbursed_by_id: string | null;
  budget_only?: boolean;
  transfer_group_id: string | null;
  transfer_leg: TransferLeg | null;
  note: string | null;
  created_at: string;
}

export interface CategoryRow {
  id: string;
  user_id: string;
  name: string;
  budget_type: CategoryType;
  budget_value: number;
  is_fixed: boolean;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
}

export interface BudgetPeriodRow {
  id: string;
  user_id: string;
  month: string;
  carry_over_amount: number;
  created_at: string;
}

export interface IncomeEntryRow {
  id: string;
  user_id: string;
  source_name: string;
  amount: number;
  expected_date: string;
  earned_month: string;
  status: IncomeStatus;
  received_date: string | null;
  updated_at?: string;
  created_at: string;
}

export interface MonthlyEarningsSnapshotRow {
  id: string;
  user_id: string;
  earned_month: string;
  total_amount: number;
  note: string | null;
  recorded_at: string;
}

export interface MonthlyEarningsGoalRow {
  id: string;
  user_id: string;
  earned_month: string;
  goal_amount: number;
}

export interface SavingsGoalRow {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  target_date: string | null;
  linked_account_id: string | null;
  contributed_amount: number;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Input types for create / update
// ---------------------------------------------------------------------------

export interface NewAccountInput {
  name: string;
  type: AccountType;
  creditLimit?: number;
  apr?: number;
  minimumPayment?: number;
  payoffTargetDate?: string;
  openingBalance?: number; // logged as an adjustment transaction on create
}

export interface NewTransactionInput {
  accountId: string;
  categoryId?: string;
  amount: number;
  date: string;
  type: TransactionType;
  budgetOnly?: boolean;
  reimbursable?: boolean;
  reimbursementStatus?: ReimbursementStatus;
  note?: string;
}

export interface NewTransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  note?: string;
}

export interface NewCategoryInput {
  name: string;
  budgetType: CategoryType;
  budgetValue: number;
  isFixed?: boolean;
  /** First active month (YYYY-MM-01). Defaults to the viewed month on create. */
  startMonth?: string;
  /** Last active month (YYYY-MM-01). Omit for ongoing categories. */
  endMonth?: string;
}

export interface NewIncomeInput {
  sourceName: string;
  amount: number;
  expectedDate: string;
  earnedMonth: string;
  status?: IncomeStatus;
  receivedDate?: string;
}

export interface NewSavingsGoalInput {
  name: string;
  targetAmount: number;
  targetDate?: string;
  linkedAccountId?: string;
  contributedAmount?: number;
}

// ---------------------------------------------------------------------------
// Row -> domain mappers
// ---------------------------------------------------------------------------

export function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    type: row.type,
    creditLimit: row.credit_limit ?? undefined,
    apr: row.apr ?? undefined,
    minimumPayment: row.minimum_payment ?? undefined,
    payoffTargetDate: row.payoff_target_date ?? undefined,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  };
}

export function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    categoryId: row.category_id ?? undefined,
    amount: Number(row.amount),
    date: row.date,
    type: row.type,
    budgetOnly: row.budget_only ?? false,
    reimbursable: row.reimbursable,
    reimbursementStatus: row.reimbursement_status,
    reimbursedById: row.reimbursed_by_id ?? undefined,
    transferGroupId: row.transfer_group_id ?? undefined,
    transferLeg: row.transfer_leg ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

/** Resolves the other account in a transfer pair for display labels. */
export function getTransferCounterpartAccountId(
  transactions: Transaction[],
  txn: Transaction,
): string | undefined {
  if (txn.type !== 'transfer' || !txn.transferGroupId) return undefined;
  return transactions.find(
    (item) => item.transferGroupId === txn.transferGroupId && item.id !== txn.id,
  )?.accountId;
}

export function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    budgetType: row.budget_type,
    budgetValue: Number(row.budget_value),
    isFixed: row.is_fixed,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  };
}

export function mapBudgetPeriod(row: BudgetPeriodRow): BudgetPeriod {
  return {
    id: row.id,
    userId: row.user_id,
    month: row.month,
    carryOverAmount: Number(row.carry_over_amount),
    createdAt: row.created_at,
  };
}

export function mapIncomeAdjustment(row: IncomeAdjustmentRow): IncomeAdjustment {
  return {
    id: row.id,
    incomeEntryId: row.income_entry_id,
    oldAmount: Number(row.old_amount),
    newAmount: Number(row.new_amount),
    adjustedAt: row.adjusted_at,
  };
}

export function mapIncomeEntry(row: IncomeEntryRow): IncomeEntry {
  return {
    id: row.id,
    userId: row.user_id,
    sourceName: row.source_name,
    amount: Number(row.amount),
    expectedDate: row.expected_date,
    earnedMonth: row.earned_month,
    status: row.status,
    receivedDate: row.received_date ?? undefined,
    updatedAt: row.updated_at ?? row.created_at,
    createdAt: row.created_at,
  };
}

export function mapMonthlyEarningsSnapshot(row: MonthlyEarningsSnapshotRow): MonthlyEarningsSnapshot {
  return {
    id: row.id,
    userId: row.user_id,
    earnedMonth: row.earned_month,
    totalAmount: Number(row.total_amount),
    note: row.note ?? undefined,
    recordedAt: row.recorded_at,
  };
}

export function mapMonthlyEarningsGoal(row: MonthlyEarningsGoalRow): MonthlyEarningsGoal {
  return {
    id: row.id,
    userId: row.user_id,
    earnedMonth: row.earned_month,
    goalAmount: Number(row.goal_amount),
  };
}

export function mapSavingsGoal(row: SavingsGoalRow): SavingsGoal {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    targetAmount: Number(row.target_amount),
    targetDate: row.target_date ?? undefined,
    linkedAccountId: row.linked_account_id ?? undefined,
    contributedAmount: Number(row.contributed_amount),
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  };
}
