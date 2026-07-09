# prime.

Personal time-tracking and project-pacing for content creators. The first feature, **Sessions**, ships in v1.

This repo is a React (Vite + TypeScript) app backed by Supabase (Postgres + Auth) and deployed to Vercel.

> Full feature spec lives in [SPEC.md](SPEC.md).

---

## Quick start

```bash
npm install
cp .env.example .env.local   # already created locally with the project's keys
npm run dev
```

The app runs at [http://localhost:5173](http://localhost:5173).

### Run the unit tests

```bash
npm test
```

The pure formula module (`src/lib/calc.ts`) is tested end-to-end so the data model from SPEC.md is verifiable without the UI.

---

## iOS (Capacitor) setup

This project is now wired to Capacitor for running as an iPhone app shell around the existing React app.

### Open in Xcode

```bash
npm run ios:sync
npm run ios:open
```

Then in Xcode:

1. Select a simulator/device target.
2. Set your Apple Team in **Signing & Capabilities** (required for physical devices).
3. Press **Run** (`Cmd+R`).

### Daily workflow

After any web code changes, resync before running again in Xcode:

```bash
npm run ios:sync
```

---

## Premiere Pro pace panel (UXP)

A read-only **prime. Pace** panel lives in [`premiere-uxp-pace/`](premiere-uxp-pace/). It signs into the same Supabase project and shows live pace while you edit.

```bash
cd premiere-uxp-pace
npm install
npm run build
```

Load `premiere-uxp-pace/dist/manifest.json` in Adobe’s UXP Developer Tool (Premiere 25.6+). Full steps: [`premiere-uxp-pace/README.md`](premiere-uxp-pace/README.md).

---

## Environment variables


| Var                      | Purpose                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | Your Supabase project URL                                                                 |
| `VITE_SUPABASE_ANON_KEY` | The Supabase **publishable / anon** key (safe to ship in the client; RLS enforces access) |
| `VITE_MOBILE_AUTH_REDIRECT_URL` | Native app OAuth callback URL (defaults to `com.prime.app://auth/callback`) |


Local dev reads them from `.env.local`. Vercel reads them from the project's Environment Variables settings.

---

## Supabase setup (one-time)

### 1. Run the migrations

Open your Supabase project → **SQL editor** and run:

Run all SQL files in `supabase/migrations` in numeric order (`001` -> latest).
For a manual setup, run at least:

1. `[supabase/migrations/001_init.sql](supabase/migrations/001_init.sql)`
2. `[supabase/migrations/002_templates.sql](supabase/migrations/002_templates.sql)`
3. `[supabase/migrations/003_project_sort_order.sql](supabase/migrations/003_project_sort_order.sql)`
4. `[supabase/migrations/004_task_sort_order.sql](supabase/migrations/004_task_sort_order.sql)`
5. `[supabase/migrations/005_project_tags.sql](supabase/migrations/005_project_tags.sql)`
6. `[supabase/migrations/006_habits.sql](supabase/migrations/006_habits.sql)`
7. `[supabase/migrations/007_goals.sql](supabase/migrations/007_goals.sql)`
8. `[supabase/migrations/008_whiteboards.sql](supabase/migrations/008_whiteboards.sql)`
9. `[supabase/migrations/009_goals_long_sort_order.sql](supabase/migrations/009_goals_long_sort_order.sql)`
10. `[supabase/migrations/010_whiteboard_preferences.sql](supabase/migrations/010_whiteboard_preferences.sql)`
11. `[supabase/migrations/011_whiteboard_folders_and_slug_aliases.sql](supabase/migrations/011_whiteboard_folders_and_slug_aliases.sql)`
12. `[supabase/migrations/012_whiteboard_media.sql](supabase/migrations/012_whiteboard_media.sql)`
13. `[supabase/migrations/013_projects_due_date_timestamptz.sql](supabase/migrations/013_projects_due_date_timestamptz.sql)`
14. `[supabase/migrations/014_integration_tokens.sql](supabase/migrations/014_integration_tokens.sql)`
15. `[supabase/migrations/015_projects_sync_true_deadline_with_due_date.sql](supabase/migrations/015_projects_sync_true_deadline_with_due_date.sql)`
16. `[supabase/migrations/016_complex_tasks.sql](supabase/migrations/016_complex_tasks.sql)`
17. `[supabase/migrations/017_task_sort_order_backfill.sql](supabase/migrations/017_task_sort_order_backfill.sql)`

This creates core tables, ordering fields (including task `sort_order` backfill), indexes, and RLS policies that scope every row to `auth.uid()`.

### 2. Configure authentication providers

1. In Supabase → **Authentication → Providers → Email**, enable Email provider and keep **Confirm email** enabled (required for this app).
2. In Google Cloud Console, create an OAuth 2.0 Client ID (Web application).
3. Add authorized redirect URIs:
  - `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. Copy the client ID + secret into Supabase → **Authentication → Providers → Google** → enable.
5. In Supabase → **Authentication → URL Configuration**, add your site URLs to the allow list:
  - `http://localhost:5173`
  - `https://<your-vercel-domain>`
  - `com.prime.app://auth/callback` (for iOS/Capacitor OAuth return)
6. In Supabase → **Authentication → URL Configuration**, set the email confirmation redirect URL(s) to the same app origins above so magic links return to your app.

After this, the `/login` page supports **Sign in with Google**, **Email sign in**, and **Email sign up** with required confirmation.

---

## Deployment to Vercel

1. Push this repo to GitHub.
2. In Vercel, **Add New → Project** and import the GitHub repo. Vercel auto-detects Vite — leave defaults (build: `npm run build`, output: `dist`).
3. Add the two env vars above under **Settings → Environment Variables**.
4. Redeploy. Then go back to Supabase and add the production URL to the redirect allow list (step 2.4 above).

---

## Repo layout

```
src/
  lib/         supabase.ts, calc.ts, types.ts, time.ts
  contexts/    AuthContext.tsx
  hooks/       useProjects, useTasks, usePaceSettings, useTimer, useClipboardTimecode, useTicker
  pages/       Login, Projects, ProjectDetail, Timer
  components/  forms, lists, timer + pace pieces
supabase/migrations/   SQL schema
public/                static assets, PWA icons
```

---

## What's in v1 (Sessions)

- Auth (Google OAuth via Supabase).
- Projects CRUD with `video_length`, datetime `due_date`, `buffer_modifier`, `tag`.
- Tasks CRUD across all four types (`scaling`, `scripting`, `custom`, `manual`) with type-specific fields and read-only "task summary" panel that surfaces computed `task_length` and `calculated_progress`.
- Pace settings: `target_deadline`, `true_deadline`, "Set pace" and "Set target time" controls. Live-ticking pace display.
- Timer page: countdown that flips red and counts up at zero, persisted duration, single-task mode and bulk mode.
- Clipboard listener: paste an `hh:mm:ss(:ff)` timestamp anywhere in single-task mode to update the active task's progress (Premiere Pro frame counts are ignored).
- Estimated progress goal snapshot per SPEC §"Estimated Progress Goal" — calculated once at timer start, never moves.
- PWA manifest so the app installs on iPhone/iPad via "Add to Home Screen".

Sessions themselves are **not** persisted — the timer is a focus aid, never a logger. Every DB write happens because the user typed or pasted something.