-- prime. — Habits schema

do $$
begin
  if not exists (select 1 from pg_type where typname = 'habit_kind') then
    create type habit_kind as enum ('check', 'count', 'scale', 'note');
  end if;
end $$;

create table if not exists public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 60),
  kind        habit_kind not null,
  schedule    jsonb not null default '{"type":"daily"}'::jsonb,
  target      integer check (target is null or target >= 1),
  unit        text,
  scale_max   integer check (scale_max is null or scale_max >= 2),
  time_of_day text check (time_of_day in ('morning', 'anytime', 'evening') or time_of_day is null),
  sort_order  integer not null default 0,
  notes       text,
  tags        text[] not null default '{}',
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint habits_kind_fields_chk check (
    case kind
      when 'count' then target is not null
      when 'scale' then scale_max is not null
      else true
    end
  )
);

create index if not exists habits_user_id_idx on public.habits(user_id);
create index if not exists habits_user_archived_idx on public.habits(user_id, archived_at);
create index if not exists habits_user_sort_idx on public.habits(user_id, sort_order, created_at);

create table if not exists public.habit_entries (
  id        uuid primary key default gen_random_uuid(),
  habit_id  uuid not null references public.habits(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  date      date not null,
  done      boolean,
  count     integer check (count is null or count >= 0),
  scale     integer check (scale is null or scale >= 0),
  note_text text,
  logged_at timestamptz not null default now(),
  constraint habit_entries_habit_date_unique unique (habit_id, date),
  constraint habit_entries_single_value_chk check (
    (case when done is not null then 1 else 0 end) +
    (case when count is not null then 1 else 0 end) +
    (case when scale is not null then 1 else 0 end) +
    (case when nullif(trim(coalesce(note_text, '')), '') is not null then 1 else 0 end) <= 1
  )
);

create index if not exists habit_entries_habit_date_idx on public.habit_entries(habit_id, date);
create index if not exists habit_entries_user_date_idx on public.habit_entries(user_id, date);

alter table public.habits enable row level security;
alter table public.habit_entries enable row level security;

drop policy if exists "habits_select_own" on public.habits;
create policy "habits_select_own"
  on public.habits for select using (auth.uid() = user_id);

drop policy if exists "habits_insert_own" on public.habits;
create policy "habits_insert_own"
  on public.habits for insert with check (auth.uid() = user_id);

drop policy if exists "habits_update_own" on public.habits;
create policy "habits_update_own"
  on public.habits for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "habits_delete_own" on public.habits;
create policy "habits_delete_own"
  on public.habits for delete using (auth.uid() = user_id);

drop policy if exists "habit_entries_select_own" on public.habit_entries;
create policy "habit_entries_select_own"
  on public.habit_entries for select
  using (
    auth.uid() = user_id and
    exists (
      select 1
      from public.habits h
      where h.id = habit_entries.habit_id
        and h.user_id = auth.uid()
    )
  );

drop policy if exists "habit_entries_insert_own" on public.habit_entries;
create policy "habit_entries_insert_own"
  on public.habit_entries for insert
  with check (
    auth.uid() = user_id and
    exists (
      select 1
      from public.habits h
      where h.id = habit_entries.habit_id
        and h.user_id = auth.uid()
    )
  );

drop policy if exists "habit_entries_update_own" on public.habit_entries;
create policy "habit_entries_update_own"
  on public.habit_entries for update
  using (
    auth.uid() = user_id and
    exists (
      select 1
      from public.habits h
      where h.id = habit_entries.habit_id
        and h.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id and
    exists (
      select 1
      from public.habits h
      where h.id = habit_entries.habit_id
        and h.user_id = auth.uid()
    )
  );

drop policy if exists "habit_entries_delete_own" on public.habit_entries;
create policy "habit_entries_delete_own"
  on public.habit_entries for delete
  using (
    auth.uid() = user_id and
    exists (
      select 1
      from public.habits h
      where h.id = habit_entries.habit_id
        and h.user_id = auth.uid()
    )
  );
