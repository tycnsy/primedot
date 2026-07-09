# prime. Pace — Premiere Pro panel

Read-only UXP panel that shows your live **prime.** pace inside Adobe Premiere Pro (25.6+).

## What it does

- Signs in with your prime. email/password (Supabase auth)
- Lists active, non-hidden pace-eligible projects
- Shows current pace (ticks every second), pace end, remaining, margin, and progress
- Refreshes project/task data from Supabase every **5 seconds**
- Panel hamburger menu: **Refresh**, **Show all projects**, **Sign out**

It does **not** write progress or control Premiere timelines.

## Setup

1. Install deps and build (credentials are read from the repo root `.env.local`):

```bash
cd premiere-uxp-pace
npm install
npm run build
```

2. Open **UXP Developer Tool** (from Creative Cloud Desktop) with Premiere Pro 25.6+ running.
3. **Add Plugin** → select `premiere-uxp-pace/dist/manifest.json` (the **dist** folder — not the parent source folder).
4. Click **Load** (or **Load & Watch** while developing).
5. In Premiere: **Window → UXP Plugins → prime. Pace**.

If the panel stays on **Loading…** or reports a missing `main.js`, you likely loaded the source `manifest.json`. Unload, then load `dist/manifest.json` after `npm run build`.

For local iteration:

```bash
npm run watch
```

After changing `manifest.json`, unload and reload the plugin in UDT (watch mode does not pick up manifest edits).

## Credentials

Build injects `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from:

1. `premiere-uxp-pace/.env.local` (optional override)
2. `../.env.local` (repo root — same as the web app)

The built `dist/manifest.json` whitelists your Supabase origin for network access.

## Notes

- Session is stored in the panel’s `localStorage` and refreshed automatically.
- Hidden pace cards (`pace_hidden`) and archived projects are omitted, matching the web Pace view.
- Pace math is a copy of `src/lib/calc.ts` under `src/paceMath.js` — update both if formulas change.
