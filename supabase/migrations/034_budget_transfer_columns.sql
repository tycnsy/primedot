-- Transfer transactions: linked two-leg rows for moving money between accounts.
-- Depends on budget_txn_type 'transfer' from 033_budget_transfers.sql.

alter table public.budget_transactions
  add column if not exists transfer_group_id uuid,
  add column if not exists transfer_leg text;

alter table public.budget_transactions
  drop constraint if exists budget_transactions_transfer_leg_chk;

alter table public.budget_transactions
  add constraint budget_transactions_transfer_leg_chk
  check (transfer_leg is null or transfer_leg in ('out', 'in'));

alter table public.budget_transactions
  drop constraint if exists budget_transactions_transfer_fields_chk;

alter table public.budget_transactions
  add constraint budget_transactions_transfer_fields_chk
  check (
    (
      type = 'transfer'
      and transfer_group_id is not null
      and transfer_leg is not null
      and amount >= 0
      and category_id is null
      and reimbursable = false
      and reimbursement_status = 'none'
      and budget_only = false
    )
    or (
      type != 'transfer'
      and transfer_group_id is null
      and transfer_leg is null
    )
  );

create index if not exists budget_transactions_user_transfer_group_idx
  on public.budget_transactions(user_id, transfer_group_id)
  where transfer_group_id is not null;
