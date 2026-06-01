-- prime. — Sidebar navigation user preferences
-- Persists custom sidebar order and visibility per user across devices.

create table if not exists public.nav_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nav_order jsonb not null default '[]'::jsonb,
  nav_hidden jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.nav_preferences enable row level security;

drop policy if exists "nav_preferences_select_own" on public.nav_preferences;
create policy "nav_preferences_select_own"
  on public.nav_preferences for select using (auth.uid() = user_id);

drop policy if exists "nav_preferences_insert_own" on public.nav_preferences;
create policy "nav_preferences_insert_own"
  on public.nav_preferences for insert with check (auth.uid() = user_id);

drop policy if exists "nav_preferences_update_own" on public.nav_preferences;
create policy "nav_preferences_update_own"
  on public.nav_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "nav_preferences_delete_own" on public.nav_preferences;
create policy "nav_preferences_delete_own"
  on public.nav_preferences for delete using (auth.uid() = user_id);
