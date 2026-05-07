-- prime. — Reusable project tags

create table if not exists public.project_tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  constraint project_tags_user_name_unique unique (user_id, name)
);

create index if not exists project_tags_user_id_idx
  on public.project_tags(user_id);

alter table public.project_tags enable row level security;

drop policy if exists "project_tags_select_own" on public.project_tags;
create policy "project_tags_select_own"
  on public.project_tags for select using (auth.uid() = user_id);

drop policy if exists "project_tags_insert_own" on public.project_tags;
create policy "project_tags_insert_own"
  on public.project_tags for insert with check (auth.uid() = user_id);

drop policy if exists "project_tags_update_own" on public.project_tags;
create policy "project_tags_update_own"
  on public.project_tags for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "project_tags_delete_own" on public.project_tags;
create policy "project_tags_delete_own"
  on public.project_tags for delete using (auth.uid() = user_id);

insert into public.project_tags (user_id, name)
select distinct p.user_id, trim(p.tag)
from public.projects p
where p.tag is not null
  and trim(p.tag) <> ''
on conflict (user_id, name) do nothing;
