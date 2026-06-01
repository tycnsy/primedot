alter table public.goals_long_logs
add column kind text not null default 'total' check (kind in ('total', 'adjustment'));

alter table public.goals_long_logs
add column delta numeric;
