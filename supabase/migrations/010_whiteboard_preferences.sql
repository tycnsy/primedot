-- prime. — Whiteboard user preferences

create table if not exists public.whiteboard_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stroke_palette jsonb not null default '["#ffffff","#1e1e1e","#e03131","#1971c2","#2f9e44","#e8590c","#9c36b5"]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.whiteboard_preferences enable row level security;

drop policy if exists "whiteboard_preferences_select_own" on public.whiteboard_preferences;
create policy "whiteboard_preferences_select_own"
  on public.whiteboard_preferences for select using (auth.uid() = user_id);

drop policy if exists "whiteboard_preferences_insert_own" on public.whiteboard_preferences;
create policy "whiteboard_preferences_insert_own"
  on public.whiteboard_preferences for insert with check (auth.uid() = user_id);

drop policy if exists "whiteboard_preferences_update_own" on public.whiteboard_preferences;
create policy "whiteboard_preferences_update_own"
  on public.whiteboard_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "whiteboard_preferences_delete_own" on public.whiteboard_preferences;
create policy "whiteboard_preferences_delete_own"
  on public.whiteboard_preferences for delete using (auth.uid() = user_id);
