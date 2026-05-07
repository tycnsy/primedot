-- prime. — Templates schema

create table if not exists public.project_templates (
  id                             uuid primary key default gen_random_uuid(),
  user_id                        uuid not null references auth.users(id) on delete cascade,
  name                           text not null,
  video_length                   integer not null default 0,
  buffer_modifier                numeric not null default 1,
  tag                            text,
  target_deadline_offset_seconds integer,
  true_deadline_offset_seconds   integer,
  created_at                     timestamptz not null default now()
);

create index if not exists project_templates_user_id_idx
  on public.project_templates(user_id);

create table if not exists public.template_tasks (
  id                 uuid primary key default gen_random_uuid(),
  template_id        uuid not null references public.project_templates(id) on delete cascade,
  name               text not null,
  type               task_type not null,
  scaling_modifier   numeric,
  scripting_modifier numeric,
  script_length      integer,
  unit_count         integer,
  unit_length        integer,
  manual_length      integer,
  created_at         timestamptz not null default now(),

  constraint template_tasks_type_fields_chk check (
    case type
      when 'scaling'   then scaling_modifier is not null
      when 'scripting' then scripting_modifier is not null and script_length is not null
      when 'custom'    then unit_count is not null and unit_length is not null
      when 'manual'    then manual_length is not null
    end
  )
);

create index if not exists template_tasks_template_id_idx
  on public.template_tasks(template_id);

alter table public.project_templates enable row level security;
alter table public.template_tasks enable row level security;

drop policy if exists "project_templates_select_own" on public.project_templates;
create policy "project_templates_select_own"
  on public.project_templates for select using (auth.uid() = user_id);

drop policy if exists "project_templates_insert_own" on public.project_templates;
create policy "project_templates_insert_own"
  on public.project_templates for insert with check (auth.uid() = user_id);

drop policy if exists "project_templates_update_own" on public.project_templates;
create policy "project_templates_update_own"
  on public.project_templates for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "project_templates_delete_own" on public.project_templates;
create policy "project_templates_delete_own"
  on public.project_templates for delete using (auth.uid() = user_id);

drop policy if exists "template_tasks_select_own" on public.template_tasks;
create policy "template_tasks_select_own"
  on public.template_tasks for select
  using (
    exists (
      select 1
      from public.project_templates t
      where t.id = template_tasks.template_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists "template_tasks_insert_own" on public.template_tasks;
create policy "template_tasks_insert_own"
  on public.template_tasks for insert
  with check (
    exists (
      select 1
      from public.project_templates t
      where t.id = template_tasks.template_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists "template_tasks_update_own" on public.template_tasks;
create policy "template_tasks_update_own"
  on public.template_tasks for update
  using (
    exists (
      select 1
      from public.project_templates t
      where t.id = template_tasks.template_id
        and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.project_templates t
      where t.id = template_tasks.template_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists "template_tasks_delete_own" on public.template_tasks;
create policy "template_tasks_delete_own"
  on public.template_tasks for delete
  using (
    exists (
      select 1
      from public.project_templates t
      where t.id = template_tasks.template_id
        and t.user_id = auth.uid()
    )
  );
