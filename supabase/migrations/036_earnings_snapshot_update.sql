-- Allow users to edit earnings snapshot history (time and value).

drop policy if exists "budget_monthly_earnings_snapshots_update_own"
  on public.budget_monthly_earnings_snapshots;
create policy "budget_monthly_earnings_snapshots_update_own"
  on public.budget_monthly_earnings_snapshots for update
  using (auth.uid() = user_id);
