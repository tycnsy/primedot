-- prime. — Budgeting module ("Money") schema

do $$
begin
  if not exists (select 1 from pg_type where typname = 'budget_account_type') then
    create type budget_account_type as enum ('checking', 'savings', 'credit');
  end if;
  if not exists (select 1 from pg_type where typname = 'budget_txn_type') then
    create type budget_txn_type as enum ('debit', 'credit', 'adjustment');
  end if;
  if not exists (select 1 from pg_type where typname = 'budget_category_type') then
    create type budget_category_type as enum ('flat', 'percentage');
  end if;
  if not exists (select 1 from pg_type where typname = 'budget_income_status') then
    create type budget_income_status as enum ('expected', 'received');
  end if;
  if not exists (select 1 from pg_type where typname = 'budget_reimbursement_status') then
    create type budget_reimbursement_status as enum ('none', 'pending', 'received');
  end if;
end $$;

-- Accounts -----------------------------------------------------------------
create table if not exists public.budget_accounts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  name               text not null check (char_length(trim(name)) between 1 and 80),
  type               budget_account_type not null,
  credit_limit       numeric(14,2),
  apr                numeric(6,3),
  minimum_payment    numeric(14,2),
  payoff_target_date date,
  sort_order         integer not null default 0,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  constraint budget_accounts_credit_fields_chk check (
    type = 'credit'
    or (credit_limit is null and apr is null and minimum_payment is null and payoff_target_date is null)
  )
);

create index if not exists budget_accounts_user_sort_idx
  on public.budget_accounts(user_id, sort_order, created_at);
create index if not exists budget_accounts_user_archived_idx
  on public.budget_accounts(user_id, archived_at);

-- Categories ---------------------------------------------------------------
create table if not exists public.budget_categories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 1 and 80),
  budget_type  budget_category_type not null,
  budget_value numeric(14,2) not null default 0 check (budget_value >= 0),
  is_fixed     boolean not null default false,
  sort_order   integer not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists budget_categories_user_sort_idx
  on public.budget_categories(user_id, sort_order, created_at);
create index if not exists budget_categories_user_archived_idx
  on public.budget_categories(user_id, archived_at);

-- Budget periods (calendar months) -----------------------------------------
create table if not exists public.budget_periods (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  month             date not null,
  carry_over_amount numeric(14,2) not null default 0,
  created_at        timestamptz not null default now(),
  constraint budget_periods_user_month_unique unique (user_id, month)
);

create index if not exists budget_periods_user_month_idx
  on public.budget_periods(user_id, month);

-- Transactions (the source of truth for balances) --------------------------
create table if not exists public.budget_transactions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  account_id           uuid not null references public.budget_accounts(id) on delete cascade,
  category_id          uuid references public.budget_categories(id) on delete set null,
  amount               numeric(14,2) not null,
  date                 date not null,
  type                 budget_txn_type not null,
  -- debit/credit are always entered as positive magnitudes; adjustments carry
  -- a signed delta so manual balance corrections can raise or lower a balance.
  constraint budget_transactions_amount_sign_chk check (type = 'adjustment' or amount >= 0),
  reimbursable         boolean not null default false,
  reimbursement_status budget_reimbursement_status not null default 'none',
  reimbursed_by_id     uuid references public.budget_transactions(id) on delete set null,
  note                 text,
  created_at           timestamptz not null default now()
);

create index if not exists budget_transactions_account_date_idx
  on public.budget_transactions(account_id, date);
create index if not exists budget_transactions_user_date_idx
  on public.budget_transactions(user_id, date);
create index if not exists budget_transactions_user_category_idx
  on public.budget_transactions(user_id, category_id);
create index if not exists budget_transactions_user_reimbursable_idx
  on public.budget_transactions(user_id) where reimbursable;

-- Income entries -----------------------------------------------------------
create table if not exists public.budget_income_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  source_name   text not null check (char_length(trim(source_name)) between 1 and 80),
  amount        numeric(14,2) not null,
  expected_date date not null,
  status        budget_income_status not null default 'expected',
  received_date date,
  created_at    timestamptz not null default now()
);

create index if not exists budget_income_user_expected_idx
  on public.budget_income_entries(user_id, expected_date);

-- Savings goals ------------------------------------------------------------
create table if not exists public.budget_savings_goals (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  name               text not null check (char_length(trim(name)) between 1 and 80),
  target_amount      numeric(14,2) not null check (target_amount > 0),
  target_date        date,
  linked_account_id  uuid references public.budget_accounts(id) on delete set null,
  contributed_amount numeric(14,2) not null default 0,
  sort_order         integer not null default 0,
  archived_at        timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists budget_savings_user_sort_idx
  on public.budget_savings_goals(user_id, sort_order, created_at);
create index if not exists budget_savings_user_archived_idx
  on public.budget_savings_goals(user_id, archived_at);

-- Row level security -------------------------------------------------------
alter table public.budget_accounts        enable row level security;
alter table public.budget_categories      enable row level security;
alter table public.budget_periods         enable row level security;
alter table public.budget_transactions    enable row level security;
alter table public.budget_income_entries  enable row level security;
alter table public.budget_savings_goals   enable row level security;

drop policy if exists "budget_accounts_select_own" on public.budget_accounts;
create policy "budget_accounts_select_own"
  on public.budget_accounts for select using (auth.uid() = user_id);
drop policy if exists "budget_accounts_insert_own" on public.budget_accounts;
create policy "budget_accounts_insert_own"
  on public.budget_accounts for insert with check (auth.uid() = user_id);
drop policy if exists "budget_accounts_update_own" on public.budget_accounts;
create policy "budget_accounts_update_own"
  on public.budget_accounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "budget_accounts_delete_own" on public.budget_accounts;
create policy "budget_accounts_delete_own"
  on public.budget_accounts for delete using (auth.uid() = user_id);

drop policy if exists "budget_categories_select_own" on public.budget_categories;
create policy "budget_categories_select_own"
  on public.budget_categories for select using (auth.uid() = user_id);
drop policy if exists "budget_categories_insert_own" on public.budget_categories;
create policy "budget_categories_insert_own"
  on public.budget_categories for insert with check (auth.uid() = user_id);
drop policy if exists "budget_categories_update_own" on public.budget_categories;
create policy "budget_categories_update_own"
  on public.budget_categories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "budget_categories_delete_own" on public.budget_categories;
create policy "budget_categories_delete_own"
  on public.budget_categories for delete using (auth.uid() = user_id);

drop policy if exists "budget_periods_select_own" on public.budget_periods;
create policy "budget_periods_select_own"
  on public.budget_periods for select using (auth.uid() = user_id);
drop policy if exists "budget_periods_insert_own" on public.budget_periods;
create policy "budget_periods_insert_own"
  on public.budget_periods for insert with check (auth.uid() = user_id);
drop policy if exists "budget_periods_update_own" on public.budget_periods;
create policy "budget_periods_update_own"
  on public.budget_periods for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "budget_periods_delete_own" on public.budget_periods;
create policy "budget_periods_delete_own"
  on public.budget_periods for delete using (auth.uid() = user_id);

drop policy if exists "budget_transactions_select_own" on public.budget_transactions;
create policy "budget_transactions_select_own"
  on public.budget_transactions for select using (auth.uid() = user_id);
drop policy if exists "budget_transactions_insert_own" on public.budget_transactions;
create policy "budget_transactions_insert_own"
  on public.budget_transactions for insert with check (auth.uid() = user_id);
drop policy if exists "budget_transactions_update_own" on public.budget_transactions;
create policy "budget_transactions_update_own"
  on public.budget_transactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "budget_transactions_delete_own" on public.budget_transactions;
create policy "budget_transactions_delete_own"
  on public.budget_transactions for delete using (auth.uid() = user_id);

drop policy if exists "budget_income_select_own" on public.budget_income_entries;
create policy "budget_income_select_own"
  on public.budget_income_entries for select using (auth.uid() = user_id);
drop policy if exists "budget_income_insert_own" on public.budget_income_entries;
create policy "budget_income_insert_own"
  on public.budget_income_entries for insert with check (auth.uid() = user_id);
drop policy if exists "budget_income_update_own" on public.budget_income_entries;
create policy "budget_income_update_own"
  on public.budget_income_entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "budget_income_delete_own" on public.budget_income_entries;
create policy "budget_income_delete_own"
  on public.budget_income_entries for delete using (auth.uid() = user_id);

drop policy if exists "budget_savings_select_own" on public.budget_savings_goals;
create policy "budget_savings_select_own"
  on public.budget_savings_goals for select using (auth.uid() = user_id);
drop policy if exists "budget_savings_insert_own" on public.budget_savings_goals;
create policy "budget_savings_insert_own"
  on public.budget_savings_goals for insert with check (auth.uid() = user_id);
drop policy if exists "budget_savings_update_own" on public.budget_savings_goals;
create policy "budget_savings_update_own"
  on public.budget_savings_goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "budget_savings_delete_own" on public.budget_savings_goals;
create policy "budget_savings_delete_own"
  on public.budget_savings_goals for delete using (auth.uid() = user_id);
