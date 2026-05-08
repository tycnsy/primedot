-- prime. — Whiteboards schema

create table if not exists public.whiteboards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  slug        text not null,
  name        text not null default 'Untitled board',
  bg_color    text,
  elements    jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  constraint whiteboards_user_slug_unique unique (user_id, slug)
);

create index if not exists whiteboards_user_updated_idx
  on public.whiteboards(user_id, updated_at desc);

alter table public.whiteboards enable row level security;

drop policy if exists "whiteboards_select_own" on public.whiteboards;
create policy "whiteboards_select_own"
  on public.whiteboards for select using (auth.uid() = user_id);

drop policy if exists "whiteboards_insert_own" on public.whiteboards;
create policy "whiteboards_insert_own"
  on public.whiteboards for insert with check (auth.uid() = user_id);

drop policy if exists "whiteboards_update_own" on public.whiteboards;
create policy "whiteboards_update_own"
  on public.whiteboards for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "whiteboards_delete_own" on public.whiteboards;
create policy "whiteboards_delete_own"
  on public.whiteboards for delete using (auth.uid() = user_id);
