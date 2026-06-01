-- prime. — To-do tags and tag metadata

alter table public.todos
add column if not exists tag text;

create table if not exists public.todo_tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null default '#9CA3AF',
  created_at timestamptz not null default now(),
  constraint todo_tags_user_name_unique unique (user_id, name)
);

create index if not exists todo_tags_user_id_idx
  on public.todo_tags(user_id);

alter table public.todo_tags enable row level security;

drop policy if exists "todo_tags_select_own" on public.todo_tags;
create policy "todo_tags_select_own"
  on public.todo_tags for select using (auth.uid() = user_id);

drop policy if exists "todo_tags_insert_own" on public.todo_tags;
create policy "todo_tags_insert_own"
  on public.todo_tags for insert with check (auth.uid() = user_id);

drop policy if exists "todo_tags_update_own" on public.todo_tags;
create policy "todo_tags_update_own"
  on public.todo_tags for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "todo_tags_delete_own" on public.todo_tags;
create policy "todo_tags_delete_own"
  on public.todo_tags for delete using (auth.uid() = user_id);
