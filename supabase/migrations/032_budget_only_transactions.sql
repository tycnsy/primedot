-- Budget-only transactions count toward category spend but not account balances.

alter table public.budget_transactions
  add column if not exists budget_only boolean not null default false;
