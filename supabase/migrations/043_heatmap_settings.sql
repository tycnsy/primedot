-- Per-user heatmap preferences (yearly view start date).

create table if not exists public.heatmap_settings (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  yearly_start_date   date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.heatmap_settings enable row level security;

drop policy if exists "heatmap_settings_select_own" on public.heatmap_settings;
create policy "heatmap_settings_select_own"
  on public.heatmap_settings for select using (auth.uid() = user_id);

drop policy if exists "heatmap_settings_insert_own" on public.heatmap_settings;
create policy "heatmap_settings_insert_own"
  on public.heatmap_settings for insert with check (auth.uid() = user_id);

drop policy if exists "heatmap_settings_update_own" on public.heatmap_settings;
create policy "heatmap_settings_update_own"
  on public.heatmap_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "heatmap_settings_delete_own" on public.heatmap_settings;
create policy "heatmap_settings_delete_own"
  on public.heatmap_settings for delete using (auth.uid() = user_id);
