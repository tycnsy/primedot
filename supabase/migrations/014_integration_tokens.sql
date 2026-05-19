-- prime. — Integration tokens for external apps (censaySplit, etc.)
-- Tokens are issued from prime. Settings and used as bearer tokens against
-- the public `sync` Edge Function. Only the SHA-256 hash is stored; the raw
-- token value is shown to the user exactly once.

create extension if not exists "pgcrypto";

create table if not exists public.integration_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (char_length(trim(name)) between 1 and 80),
  token_hash    text not null unique,
  token_prefix  text not null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

create index if not exists integration_tokens_user_id_idx
  on public.integration_tokens(user_id);

alter table public.integration_tokens enable row level security;

-- Users can only see / manage their own tokens.
drop policy if exists "integration_tokens_select_own" on public.integration_tokens;
create policy "integration_tokens_select_own"
  on public.integration_tokens for select using (auth.uid() = user_id);

drop policy if exists "integration_tokens_insert_own" on public.integration_tokens;
create policy "integration_tokens_insert_own"
  on public.integration_tokens for insert with check (auth.uid() = user_id);

drop policy if exists "integration_tokens_update_own" on public.integration_tokens;
create policy "integration_tokens_update_own"
  on public.integration_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "integration_tokens_delete_own" on public.integration_tokens;
create policy "integration_tokens_delete_own"
  on public.integration_tokens for delete using (auth.uid() = user_id);
