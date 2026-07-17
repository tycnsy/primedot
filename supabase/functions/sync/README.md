# `sync` Edge Function

Public HTTP API used by external apps (censaySplit, etc.) to read projects /
tasks and push back progress updates. Authenticates with a `cnsy_prime_*`
bearer token issued from prime. Settings → Integrations.

## Endpoints

All endpoints require `Authorization: Bearer cnsy_prime_<random>`.

| Method | Path                          | Body                          | Returns                                            |
|--------|-------------------------------|-------------------------------|----------------------------------------------------|
| GET    | `/whoami`                     | —                             | `{ user_id, email }`                               |
| GET    | `/projects`                   | —                             | `{ projects: [...], tasks: [...] }` (token user)   |
| PATCH  | `/tasks/:id/progress`         | `{ current_progress: number }`| `{ id, current_progress, status }`                 |

## Required environment variables

The Edge Function reads:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Both are automatically provided by Supabase to deployed functions — no extra
setup needed.

## Deploy

```bash
# First-time deploy (and any subsequent deploys):
supabase functions deploy sync --no-verify-jwt
```

The `--no-verify-jwt` flag is **required**: this function authenticates with
our own `cnsy_prime_*` tokens, not Supabase JWTs. With JWT verification on,
Supabase's gateway rejects every request before our code runs.

The accompanying `supabase/config.toml` already declares
`verify_jwt = false` for this function so future `supabase functions deploy`
calls inherit the same behavior.

## Smoke test

After deploy, run from a terminal that has the raw token (created in
prime. → Settings → Integrations):

```bash
curl -i \
  -H "Authorization: Bearer $CNSY_PRIME_TOKEN" \
  "https://<your-project>.supabase.co/functions/v1/sync/whoami"
```

Expected: `200 OK` with `{ "user_id": "...", "email": "..." }`.

## Task fields for censaySplit groupings

Each task in `GET /projects` includes grouping settings for censaySplit's
"groupings" run-segment mode:

| Field | Type | Notes |
|-------|------|-------|
| `groupable` | boolean | When `false`, exclude this task from grouping runs. |
| `grouping_progress` | integer \| null | Progress increment per grouping. Same units as `current_progress`: seconds for `scaling` / `scripting` / `manual`; whole units for `custom`. `null` when not groupable. |
| `subsplit_length` | integer | Subsplit length in seconds. Default `60` (`00:01:00`). |
| `source_timecode_based` | boolean | When `true`, external apps should treat the task as source-timecode-based. Default `false`. |

Use `sort_order` to determine grouping sequence. For each groupable task,
censaySplit can target `current_progress + grouping_progress`.

## Database dependency

This function relies on:

- `public.projects` and `public.tasks` (created by `001_init.sql`).
- `public.integration_tokens` (created by `014_integration_tokens.sql`).
- `037_task_grouping.sql` — `grouping_progress` and `groupable` on tasks.
- `049_task_subsplit_and_source_timecode.sql` — `subsplit_length` and `source_timecode_based` on tasks.

Run the migrations in the Supabase SQL editor before invoking the function.
