-- Monthly earnings: earned_month on income, snapshot history, per-month goals.

alter table public.budget_income_entries
  add column if not exists earned_month date;

update public.budget_income_entries
set earned_month = date_trunc('month', expected_date)::date
where earned_month is null;

alter table public.budget_income_entries
  alter column earned_month set not null;

alter table public.budget_income_adjustments
  add column if not exists old_earned_month date,
  add column if not exists new_earned_month date;

create or replace function public.log_budget_income_adjustment()
returns trigger
language plpgsql
as $$
begin
  if (
    old.amount is distinct from new.amount
    or old.expected_date is distinct from new.expected_date
    or old.status is distinct from new.status
    or old.received_date is distinct from new.received_date
    or old.earned_month is distinct from new.earned_month
  ) then
    insert into public.budget_income_adjustments (
      user_id,
      income_entry_id,
      source_name,
      old_amount,
      new_amount,
      old_expected_date,
      new_expected_date,
      old_status,
      new_status,
      old_received_date,
      new_received_date,
      old_earned_month,
      new_earned_month
    ) values (
      new.user_id,
      new.id,
      new.source_name,
      old.amount,
      new.amount,
      old.expected_date,
      new.expected_date,
      old.status,
      new.status,
      old.received_date,
      new.received_date,
      old.earned_month,
      new.earned_month
    );
  end if;

  return new;
end;
$$;

create table if not exists public.budget_monthly_earnings_snapshots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  earned_month  date not null,
  total_amount  numeric(14,2) not null,
  note          text,
  recorded_at   timestamptz not null default now()
);

create index if not exists budget_monthly_earnings_snapshots_user_month_idx
  on public.budget_monthly_earnings_snapshots(user_id, earned_month, recorded_at desc);

create table if not exists public.budget_monthly_earnings_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  earned_month  date not null,
  goal_amount   numeric(14,2) not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, earned_month)
);

create or replace function public.set_budget_monthly_earnings_goal_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists budget_monthly_earnings_goal_set_updated_at
  on public.budget_monthly_earnings_goals;
create trigger budget_monthly_earnings_goal_set_updated_at
before update on public.budget_monthly_earnings_goals
for each row
execute function public.set_budget_monthly_earnings_goal_updated_at();

-- Seed one snapshot per month that already has income entries.
insert into public.budget_monthly_earnings_snapshots (user_id, earned_month, total_amount, note)
select
  e.user_id,
  e.earned_month,
  sum(e.amount),
  'Initial backfill'
from public.budget_income_entries e
group by e.user_id, e.earned_month
on conflict do nothing;

alter table public.budget_monthly_earnings_snapshots enable row level security;
alter table public.budget_monthly_earnings_goals enable row level security;

drop policy if exists "budget_monthly_earnings_snapshots_select_own"
  on public.budget_monthly_earnings_snapshots;
create policy "budget_monthly_earnings_snapshots_select_own"
  on public.budget_monthly_earnings_snapshots for select using (auth.uid() = user_id);

drop policy if exists "budget_monthly_earnings_snapshots_insert_own"
  on public.budget_monthly_earnings_snapshots;
create policy "budget_monthly_earnings_snapshots_insert_own"
  on public.budget_monthly_earnings_snapshots for insert with check (auth.uid() = user_id);

drop policy if exists "budget_monthly_earnings_snapshots_delete_own"
  on public.budget_monthly_earnings_snapshots;
create policy "budget_monthly_earnings_snapshots_delete_own"
  on public.budget_monthly_earnings_snapshots for delete using (auth.uid() = user_id);

drop policy if exists "budget_monthly_earnings_goals_select_own"
  on public.budget_monthly_earnings_goals;
create policy "budget_monthly_earnings_goals_select_own"
  on public.budget_monthly_earnings_goals for select using (auth.uid() = user_id);

drop policy if exists "budget_monthly_earnings_goals_insert_own"
  on public.budget_monthly_earnings_goals;
create policy "budget_monthly_earnings_goals_insert_own"
  on public.budget_monthly_earnings_goals for insert with check (auth.uid() = user_id);

drop policy if exists "budget_monthly_earnings_goals_update_own"
  on public.budget_monthly_earnings_goals;
create policy "budget_monthly_earnings_goals_update_own"
  on public.budget_monthly_earnings_goals for update using (auth.uid() = user_id);

drop policy if exists "budget_monthly_earnings_goals_delete_own"
  on public.budget_monthly_earnings_goals;
create policy "budget_monthly_earnings_goals_delete_own"
  on public.budget_monthly_earnings_goals for delete using (auth.uid() = user_id);
