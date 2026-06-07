# Budgeting Module — Cursor Plan Mode Prompt

## Context

I am adding a **budgeting module** to an existing Tauri app with a Supabase/PostgreSQL backend. Before writing any code, I want you to enter **plan mode** and produce a full implementation plan. Review the existing codebase first — match all patterns, conventions, component structure, styling, and state management already in use. Do not introduce new libraries or patterns unless something critical is missing and you flag it explicitly before proceeding.

---

## What to Do Before Planning

1. Scan the existing codebase and identify:
   - Folder and file structure conventions
   - How components are organized and named
   - State management approach (context, zustand, redux, signals, etc.)
   - How Supabase is initialized and queried
   - Existing UI component library or styling system in use
   - Any routing conventions
2. Use everything you find as the baseline. The budgeting module must feel like a native part of this app, not a bolted-on addition.

---

## Module Overview

Build a **budgeting module** with the following capabilities. All data is manual — there is no bank or card sync. Users enter everything themselves.

---

## Data Models

Design and plan the following Supabase/PostgreSQL tables. Apply appropriate foreign keys, constraints, and indexes.

### `accounts`
- `id`, `user_id`, `name`, `type` (checking | savings | credit), `current_balance`, `created_at`
- Credit-specific fields: `credit_limit`, `apr`, `minimum_payment`, `payoff_target_date`

### `transactions`
- `id`, `user_id`, `account_id` (FK), `category_id` (FK, nullable), `amount`, `date`, `type` (debit | credit | adjustment)
- `reimbursable` (boolean), `reimbursement_status` (none | pending | received)
- `note` (text, optional)
- Balance is never stored as a bare number — it is always derived from the transaction log. Manual balance corrections are stored as `type: adjustment` entries so there is always a full audit trail.

### `categories`
- `id`, `user_id`, `name`, `budget_type` (flat | percentage), `budget_value`
- `is_fixed` (boolean) — fixed categories (e.g. rent) are subtracted first before percentage categories are computed
- `sort_order` (integer)

### `budget_periods`
- `id`, `user_id`, `month` (date, first of month), `carry_over_amount`
- Periods are calendar months. At month rollover, compute carry-over: unspent budget adds to next month's available amount; overspent budget subtracts from it. Store the net carry-over on the new period record.

### `income_entries`
- `id`, `user_id`, `source_name`, `amount`, `expected_date`, `status` (expected | received), `received_date` (nullable)

### `savings_goals`
- `id`, `user_id`, `name`, `target_amount`, `target_date`, `linked_account_id` (FK, nullable), `contributed_amount`

### `reimbursements`
- Virtual — do not create a separate table. Reimbursements are tracked via `reimbursable` and `reimbursement_status` fields on the `transactions` table. When a reimbursement is received, log an offsetting `type: credit` transaction and mark the original as `received`.

---

## Budget Computation Logic

Plan this as a service layer or utility module that can be called from any component.

**Each calendar month, in order:**
1. Sum all `income_entries` where `expected_date` falls in the month (use expected amounts for planning; swap to received amounts when confirmed)
2. Sum all flat-budget (`is_fixed: true`) categories — subtract from income total
3. Remaining amount is the **distributable base** for percentage categories
4. Each percentage category gets `budget_value%` of the distributable base
5. Add `carry_over_amount` from `budget_periods` to each category's effective budget (positive = more to spend, negative = already overspent)
6. Compare each category's effective budget against actual spend from `transactions` in that month → this is the live "spent vs. budgeted" value surfaced in the UI

---

## Income Timeline Logic

Plan a projection function that:
- Takes the user's current confirmed balance (derived from transaction log)
- Layers in `income_entries` sorted by `expected_date`
- Produces a **projected daily balance** for the rest of the current month
- Distinguishes between expected (dashed/muted) and confirmed (solid) income visually

---

## Credit / Debt Payoff Logic

Plan a payoff calculator utility that accepts:
- Current balance, APR, monthly payment amount
- Returns: months to payoff, total interest paid, amortization schedule
- Support two display modes (no separate data needed): **fixed extra payment** and **minimum only**
- If multiple credit accounts exist, support **avalanche** (highest APR first) and **snowball** (lowest balance first) strategies as view modes

---

## UI Sections

Plan each as its own route or tab within the module. Use whatever routing and layout patterns already exist in the app.

### Dashboard
- Net worth snapshot (sum of all account balances, liabilities subtracted)
- Spent vs. budgeted per category — progress bars, color-coded (under / near / over)
- Upcoming income (next 7 days)
- Outstanding reimbursements total
- Carry-over indicator for current month (positive or negative)

### Accounts
- List of all accounts with current balance
- Manual balance entry form (logs an `adjustment` transaction)
- Per-account transaction history with filters (date range, type, category)
- Add / edit / archive accounts

### Budget
- Category list: name, type badge (flat / %), budget amount, spent so far, remaining
- Period selector (previous months read-only, current month editable)
- Inline editing of budget values
- Carry-over display per category
- Add / reorder / delete categories

### Income Planner
- List or calendar view of income entries for the current month
- Mark as received (logs a confirming transaction, updates status)
- Projected balance timeline
- Add / edit / delete planned income entries

### Debt Payoff
- One card per credit account: balance, limit, utilization %, APR, payoff timeline
- Strategy selector (minimum only / fixed extra / avalanche / snowball)
- Amortization preview (collapsible)

### Savings Goals
- Goal cards: name, progress bar, target amount, target date, projected completion date
- Projected completion is computed from average monthly contribution rate
- Add / edit / delete goals
- Manual contribution entry (logs a transaction to linked account if set)

### Reimbursements
- Filtered transaction list: all `reimbursable: true` entries
- Grouped by status: Pending / Received
- Outstanding total prominently displayed
- Mark as received action (logs offsetting credit transaction)

---

## Constraints & Decisions Already Made

| Decision | Value |
|---|---|
| Period definition | Calendar month |
| Percentage base | Remaining income after fixed/flat categories |
| Currency | Single currency only (no multi-currency) |
| Carry-over | Unspent and overspent amounts both carry into next month |
| Balance source of truth | Transaction log (never a stored scalar) |
| Bank sync | None — fully manual |

---

## What I Want from Plan Mode

Before writing a single line of code, produce:

1. **Codebase audit summary** — what patterns you found and will follow
2. **File & folder plan** — every new file you intend to create, with a one-line description
3. **Database migration plan** — all tables, columns, constraints, and indexes as SQL
4. **Service/utility layer plan** — budget computation, income projection, payoff calculator
5. **Component tree** — how the UI sections break down into components
6. **State management plan** — what lives in global state vs. local vs. server state
7. **Implementation order** — a sequenced build order so each phase is independently testable
8. **Open questions** — anything ambiguous that you need me to decide before you start coding

Do not begin implementation until I have reviewed and approved the plan.
