-- Track projected income adjustments with timestamped history.

alter table public.budget_income_entries
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_budget_income_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists budget_income_set_updated_at on public.budget_income_entries;
create trigger budget_income_set_updated_at
before update on public.budget_income_entries
for each row
execute function public.set_budget_income_updated_at();

create table if not exists public.budget_income_adjustments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  income_entry_id    uuid not null references public.budget_income_entries(id) on delete cascade,
  source_name        text not null,
  old_amount         numeric(14,2) not null,
  new_amount         numeric(14,2) not null,
  old_expected_date  date not null,
  new_expected_date  date not null,
  old_status         budget_income_status not null,
  new_status         budget_income_status not null,
  old_received_date  date,
  new_received_date  date,
  adjusted_at        timestamptz not null default now()
);

create index if not exists budget_income_adjustments_user_time_idx
  on public.budget_income_adjustments(user_id, adjusted_at desc);
create index if not exists budget_income_adjustments_entry_time_idx
  on public.budget_income_adjustments(income_entry_id, adjusted_at desc);

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
      new_received_date
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
      new.received_date
    );
  end if;

  return new;
end;
$$;

drop trigger if exists budget_income_log_adjustment on public.budget_income_entries;
create trigger budget_income_log_adjustment
after update on public.budget_income_entries
for each row
execute function public.log_budget_income_adjustment();

alter table public.budget_income_adjustments enable row level security;

drop policy if exists "budget_income_adjustments_select_own" on public.budget_income_adjustments;
create policy "budget_income_adjustments_select_own"
  on public.budget_income_adjustments for select using (auth.uid() = user_id);

drop policy if exists "budget_income_adjustments_insert_own" on public.budget_income_adjustments;
create policy "budget_income_adjustments_insert_own"
  on public.budget_income_adjustments for insert with check (auth.uid() = user_id);
