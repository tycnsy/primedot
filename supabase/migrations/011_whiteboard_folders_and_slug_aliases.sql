-- prime. — Whiteboard folders, ordering, and slug aliases

create table if not exists public.whiteboard_folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  parent_id   uuid references public.whiteboard_folders(id) on delete cascade,
  name        text not null,
  slug        text not null,
  sort_order  numeric not null default 0,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  constraint whiteboard_folders_user_parent_slug_unique unique (user_id, parent_id, slug)
);

create index if not exists whiteboard_folders_user_parent_order_idx
  on public.whiteboard_folders(user_id, parent_id, sort_order, created_at);

alter table public.whiteboard_folders enable row level security;

drop policy if exists "whiteboard_folders_select_own" on public.whiteboard_folders;
create policy "whiteboard_folders_select_own"
  on public.whiteboard_folders for select using (auth.uid() = user_id);

drop policy if exists "whiteboard_folders_insert_own" on public.whiteboard_folders;
create policy "whiteboard_folders_insert_own"
  on public.whiteboard_folders for insert with check (auth.uid() = user_id);

drop policy if exists "whiteboard_folders_update_own" on public.whiteboard_folders;
create policy "whiteboard_folders_update_own"
  on public.whiteboard_folders for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "whiteboard_folders_delete_own" on public.whiteboard_folders;
create policy "whiteboard_folders_delete_own"
  on public.whiteboard_folders for delete using (auth.uid() = user_id);

alter table public.whiteboards
  add column if not exists folder_id uuid references public.whiteboard_folders(id) on delete set null,
  add column if not exists sort_order numeric not null default 0,
  add column if not exists is_pinned boolean not null default false,
  add column if not exists pinned_order numeric not null default 0;

create index if not exists whiteboards_user_folder_sort_idx
  on public.whiteboards(user_id, folder_id, sort_order, updated_at desc);

create index if not exists whiteboards_user_pinned_order_idx
  on public.whiteboards(user_id, is_pinned, pinned_order, updated_at desc);

with ordered as (
  select id, row_number() over (partition by user_id, folder_id order by updated_at desc, created_at desc) as rn
  from public.whiteboards
)
update public.whiteboards wb
set sort_order = ordered.rn
from ordered
where wb.id = ordered.id
  and wb.sort_order = 0;

with pinned as (
  select id, row_number() over (partition by user_id order by updated_at desc, created_at desc) as rn
  from public.whiteboards
  where is_pinned = true
)
update public.whiteboards wb
set pinned_order = pinned.rn
from pinned
where wb.id = pinned.id
  and wb.pinned_order = 0;

create table if not exists public.whiteboard_slug_aliases (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.whiteboards(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  slug        text not null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  constraint whiteboard_slug_aliases_user_slug_unique unique (user_id, slug)
);

create unique index if not exists whiteboard_slug_aliases_board_slug_unique_idx
  on public.whiteboard_slug_aliases(board_id, slug);

create index if not exists whiteboard_slug_aliases_board_idx
  on public.whiteboard_slug_aliases(board_id);

alter table public.whiteboard_slug_aliases enable row level security;

drop policy if exists "whiteboard_slug_aliases_select_own" on public.whiteboard_slug_aliases;
create policy "whiteboard_slug_aliases_select_own"
  on public.whiteboard_slug_aliases for select using (auth.uid() = user_id);

drop policy if exists "whiteboard_slug_aliases_insert_own" on public.whiteboard_slug_aliases;
create policy "whiteboard_slug_aliases_insert_own"
  on public.whiteboard_slug_aliases for insert with check (auth.uid() = user_id);

drop policy if exists "whiteboard_slug_aliases_update_own" on public.whiteboard_slug_aliases;
create policy "whiteboard_slug_aliases_update_own"
  on public.whiteboard_slug_aliases for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "whiteboard_slug_aliases_delete_own" on public.whiteboard_slug_aliases;
create policy "whiteboard_slug_aliases_delete_own"
  on public.whiteboard_slug_aliases for delete using (auth.uid() = user_id);
