# prime. habits — Spec Sheet (Web App, v1)

A habit tracking module that lives inside the existing **prime** project-management web app. This spec describes the **web (desktop) version only**. Mobile / iPad come later.

> **Visual reference:** `prime habits.html` in this project. The HTML mock is the source of truth for layout, spacing, and color. This document captures the data model, behavior, and component contracts.

---

## 1. Goals & non-goals

**Goals**
- Add a fourth top-level area to prime: **Habits** (alongside Projects, Templates, Timer).
- Track personal habits (run, prayer, skincare, etc.) — completely separate from work projects.
- Support 4 tracking types: simple check, counter, 1–5 scale, journal note.
- Provide three views: **Today** (focused checklist), **Index** (all habits), **Detail** (single habit stats).
- Match the existing prime visual system 1:1 — no new design language.

**Non-goals (v1)**
- No mobile or tablet UI (separate spec later).
- No social / sharing features.
- **No linkage to projects.** Habits are personal-life only; projects are work-only. Keep the two domains fully separate. Do not surface project pickers, project IDs, or project metadata anywhere in the Habits area.
- No reminders / push notifications (v2).
- No import from other trackers (v2).

---

## 2. Visual system (inherit from prime)

All tokens already exist in the prime app — re-use, don't redefine.

| Token | Light | Dark |
|---|---|---|
| `--bg`        | `#e7e6dd` | `#1a1916` |
| `--surface`   | `#efeee6` | `#232220` |
| `--line-soft` | `#dcdacd` | `#2e2d28` |
| `--ink`       | `#1f1d18` | `#ece9df` |
| `--ink-2`     | `#4b4942` | `#c0bdb1` |
| `--muted`     | `#8a8779` | `#8b8779` |
| `--accent`    | `#cc7c5e` | `#cc7c5e` |
| `--accent-tint` | `#f1d8c9` | `#3a261d` |
| `--positive` | `#2f8f5e` | `#2f8f5e` |

- Font: **Inter** 400/500/600 (same as rest of prime).
- Mono: **JetBrains Mono** for keyboard hints / numeric overlays.
- Radii: `6 / 10 / 14 / 18` px (`--r-1` … `--r-4`).
- Card pattern: `--surface` background, 14px radius, 22–26px padding.
- Tab pill, tag chip, button styles: re-use existing prime components.

---

## 3. Information architecture

```
/habits                          # Index — all habits, today's status
/habits/today                    # Today — focused, time-blocked checklist
/habits/:habitId                 # Detail — heatmap, stats, log
/habits/:habitId/edit            # Edit settings (modal, not a page)
/habits/archive                  # Archived habits
/habits/new                      # Modal triggered from any view
```

Add **Habits** as the 4th item in the existing left sidebar (after Timer), with this icon:
```svg
<svg viewBox="0 0 14 14" fill="none">
  <path d="M2 11l3-3 2.5 2.5L12 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  <circle cx="5" cy="8" r="0.8" fill="currentColor"/>
  <circle cx="7.5" cy="10.5" r="0.8" fill="currentColor"/>
  <circle cx="12" cy="5" r="0.8" fill="currentColor"/>
</svg>
```

---

## 4. Data model

```ts
type HabitKind = 'check' | 'count' | 'scale' | 'note';

interface Habit {
  id: string;
  userId: string;
  name: string;                  // e.g. "Run", "Water"
  kind: HabitKind;
  schedule: Schedule;            // see below
  target?: number;               // 'count' kind: e.g. 8 (glasses)
  unit?: string;                 // 'count' kind: e.g. "glasses"
  scaleMax?: number;             // 'scale' kind: default 5
  timeOfDay?: 'morning' | 'anytime' | 'evening' | null;
  order: number;                 // user-controlled sort order
  createdAt: string;             // ISO
  archivedAt: string | null;
  notes?: string;                // freeform habit-level notes
  tags?: string[];
}

type Schedule =
  | { type: 'daily' }
  | { type: 'weekdays', days: ('mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun')[] }  // ["mon","wed","fri"]
  | { type: 'times-per-week', count: number }                                    // 3× / week
  | { type: 'times-per-day',  count: number };                                   // 5× / day (prayer)

interface HabitEntry {
  id: string;
  habitId: string;
  userId: string;
  date: string;                  // YYYY-MM-DD (local) — primary key with habitId
  // exactly one of:
  done?: boolean;                // 'check'
  count?: number;                // 'count'
  scale?: number;                // 'scale' (1..scaleMax, 0 = unset)
  noteText?: string;             // 'note'
  loggedAt: string;              // ISO timestamp of last update
}
```

**Constraints**
- `(habitId, date)` is unique — one entry per habit per day. Re-checking overwrites.
- Dates are stored & compared in the user's **local timezone**. Persist tz on the user record.
- "Done" definition per kind:
  - `check`: `done === true`
  - `count`: `count >= target`
  - `scale`: `scale > 0` (any rating counts as "logged")
  - `note`: `noteText` is non-empty

---

## 5. Screens

### 5.1 Today (`/habits/today`)
The default landing page when clicking Habits in the sidebar.

**Layout** (centered column, max-width 720px):
1. Crumb: `← Habits`
2. Date label (small, uppercase muted): `TUESDAY · MAY 6`
3. Page title: `Good morning, {firstName}.` (greeting changes by hour: morning/afternoon/evening)
4. Subtitle: `{doneCount} of {totalCount} habits checked off · keep going`
5. Right-aligned ring-progress (56px) showing `doneCount / totalCount`.
6. Three sections, each a `card`:
   - **Morning** (06–11) — habits with `timeOfDay === 'morning'`
   - **During the day** (anytime) — `timeOfDay === 'anytime'` or null
   - **Evening** (20–23) — `timeOfDay === 'evening'`
7. Each row uses the **HabitRow** component (see §6).
8. Centered "Quick-add habit" button at the bottom with keyboard hint `N`.

**Behavior**
- Clicking a check toggles done; row animates (160ms ease) — strike-through name, accent fill.
- Optimistic update; rollback on API error with a toast.
- Keyboard: `Space` toggles focused row; `↑/↓` move focus; `N` opens new-habit modal; `/` focuses search.

### 5.2 Index (`/habits`)
All habits in one list. Use this when the user wants to manage / re-order / see weekly cadence.

**Layout** (max-width 920px):
1. Crumb: `← Home`
2. H1: `Habits`
3. Subtitle: `{weekday}, {date} · {doneCount} of {totalCount} done today`
4. Right-aligned actions: `Edit` · `View archive` · `+ New habit` (primary)
5. Tab pill: `Today | Week | Month | All` (default Today)
6. Keyboard hints row (right-aligned, muted): `N new · Space toggle · / search`
7. **Progress card**: ring-progress + `{done}/{total} habits` + 3 stats (Streak, Longest, Consistency).
8. **Habit list card**: rows = `HabitRow` component; columns:
   - drag handle (left, on hover)
   - name + schedule meta
   - 7-day strip (last 7 days)
   - flame + streak count
   - control (varies by kind)

**Behavior**
- Drag handle reorders; persists `Habit.order`.
- Row click → `/habits/:id` detail.
- The control cell is interactive without navigating away.

### 5.3 Detail (`/habits/:id`)

**Layout** (max-width 920px):
1. Crumb: `← Habits`
2. H1: habit name
3. Tags row: schedule (`Mon · Wed · Fri`), goal (`Goal · 3× / week`), `Started {date}`
4. Right actions: `Edit` · `Archive` · `Mark done` (primary)
5. Tab pill: `Overview | Log | Notes | Settings`
6. Stat strip card: 5 stats — Current streak (accent color), Longest streak, This month (`X/Y sessions`), Consistency %, Total sessions
7. **Last 6 months heatmap** card: 26-week × 7-day grid, 4 intensity levels (`l1`–`l4` use `--accent-tint` → `--accent`). Legend: `Less ▢▣▤▥ More` + month labels.
8. Two-column grid:
   - **Left (1.3fr)**: Recent log — list of LogEntry components (date, status icon, detail text).
   - **Right (1fr)**: stacked cards
     - **Goal card** — current month's goal: big number (`11 / 13 sessions`), `2 to go` muted, progress bar, status line ("You're 2 days ahead of pace").
     - **Notes card** — freeform habit notes + tag chips.

> **No "Linked project" card.** Removed in this revision. Habits and projects are intentionally separate.

---

## 6. Components

All components are pure / presentational unless noted. State lives in the route container or in a `useHabits()` hook.

### 6.1 `HabitRow`
```ts
interface HabitRowProps {
  habit: Habit;
  entry: HabitEntry | null;        // today's entry (or null)
  onToggle: () => void;             // check kind
  onCount: (n: number) => void;     // count kind
  onScale: (n: number) => void;     // scale kind
  onNoteOpen: () => void;           // opens note editor
  showWeekStrip?: boolean;          // index view: true; today view: false
  showStreak?: boolean;             // both true
  draggable?: boolean;              // index view only
}
```
- Grid: `[drag] [name+meta] [week-strip?] [streak] [control]`
- Done state: row gets `.done` class — name strike-through + muted.

### 6.2 `Check`
```ts
interface CheckProps { on: boolean; onClick: () => void; size?: number; /* default 22 */ }
```
- Square w/ 6px radius. Off: 1.5px line border. On: filled `--accent` + white check SVG.
- 160ms `cubic-bezier(.2,.8,.2,1)` transition on background + border.

### 6.3 `Counter`
```ts
interface CounterProps { value: number; target?: number; onChange: (n: number) => void; }
```
- Pill with `[−] {value}/{target} [+]`. Min 0, no max.

### 6.4 `DotsScale`
```ts
interface DotsScaleProps { value: number; max?: number; onChange: (n: number) => void; }
```
- 5 (default) clickable dots. Filled dots up to `value`. Click filled dot to clear (toggle).

### 6.5 `WeekStrip`
```ts
type DayState = 'done' | 'partial' | 'skip' | 'idle' | 'future';
interface WeekStripProps { data: DayState[7]; todayIdx: number; size?: number; }
```
- 7 squares, 4px gap, 5px radius. `today` gets a 1.5px outline ring.

### 6.6 `Heatmap`
```ts
interface HeatmapProps { weeks: number; entries: HabitEntry[]; }
```
- Grid: `weeks` columns × 7 rows. Each cell = 1 day. Map `entry` → level 1–4 by:
  - `check`: 1 = done
  - `count`: ratio `count/target` → 1..4
  - `scale`: `scale/max` → 1..4
  - `note`: 2 if non-empty, 0 otherwise

### 6.7 `RingProgress`
```ts
interface RingProgressProps { percent: number; size?: number; }
```
- Conic-gradient ring with hollow center; renders the ratio of done habits.

### 6.8 `LogEntry`
```ts
interface LogEntryProps { date: string; status: 'done'|'skip'|'partial'; detail?: string; onMore?: () => void; }
```

---

## 7. State / data hooks

### `useHabits()`
Returns user's active habits, plus mutations.
```ts
{
  habits: Habit[];                // active, ordered
  archivedHabits: Habit[];
  isLoading: boolean;
  error: Error | null;
  createHabit(input: NewHabit): Promise<Habit>;
  updateHabit(id: string, patch: Partial<Habit>): Promise<Habit>;
  archiveHabit(id: string): Promise<void>;
  reorderHabits(ids: string[]): Promise<void>;
}
```

### `useEntries(date: string)`
```ts
{
  entries: Record<habitId, HabitEntry>;   // map for fast lookup
  toggleCheck(habitId: string): Promise<void>;
  setCount(habitId: string, n: number): Promise<void>;
  setScale(habitId: string, n: number): Promise<void>;
  setNote(habitId: string, text: string): Promise<void>;
}
```

### `useHabitDetail(habitId: string)`
```ts
{
  habit: Habit;
  entries: HabitEntry[];           // last 180 days
  stats: { currentStreak; longestStreak; thisMonth: {done; total}; consistency; total };
  log(): LogItem[];                // entries grouped/formatted
}
```

All mutations are **optimistic**: update local cache immediately, rollback on server error with a toast.

---

## 8. API endpoints

```
GET    /api/habits                       → Habit[]                (active only by default)
GET    /api/habits?archived=1            → Habit[]
POST   /api/habits                       → Habit
PATCH  /api/habits/:id                   → Habit
POST   /api/habits/:id/archive           → 204
POST   /api/habits/reorder               → 204    body: { orderedIds: string[] }

GET    /api/habits/:id/entries?from=&to= → HabitEntry[]
PUT    /api/habits/:id/entries/:date     → HabitEntry   (upsert by date)
DELETE /api/habits/:id/entries/:date     → 204

GET    /api/habits/:id/stats             → { currentStreak, longestStreak, total, consistency, monthDone, monthTotal }
```

- All routes scoped to current user; reject cross-user access with 404 (not 403, to avoid existence leakage).
- Date param format: `YYYY-MM-DD` interpreted in user's tz.

---

## 9. Stat calculations (server-side)

- **Current streak**: longest run of consecutive scheduled days ending **today or yesterday** that are "done" per §4. A day not on the schedule does NOT break the streak.
- **Longest streak**: max run over full history.
- **Consistency (%)**: `done days / scheduled days` over the last 30 scheduled occurrences.
- **This month**: count of `done` entries vs scheduled occurrences in the current calendar month.

Cache `stats` per habit; invalidate on entry mutation.

---

## 10. New-habit modal

Triggered from `+ New habit` button or `N` key.

**Fields**
1. Name (required, 1–60 chars)
2. Kind: radio — `Check`, `Count`, `Scale (1–5)`, `Note`
3. Conditional fields:
   - Count: `Target` (number, ≥1) and `Unit` (string, e.g. "glasses")
   - Scale: `Scale max` (default 5)
4. Schedule: tabs `Daily | Weekdays | Times per week | Times per day`
5. Time of day (optional): `Morning | Anytime | Evening` segmented
6. Tags (optional, freeform)

**Behavior**
- Submit → POST → close modal → optimistically prepend to list.
- `Esc` cancels. `⌘/Ctrl + Enter` submits.

---

## 11. Keyboard

| Key | Action |
|---|---|
| `N` | New habit modal |
| `/` | Focus search (Index view) |
| `↑` / `↓` | Move row focus |
| `Space` | Toggle focused row (check kind) |
| `Enter` | Open detail of focused row |
| `Esc` | Close modal / clear focus |

---

## 12. Accessibility

- All interactive controls are real `<button>` elements with `aria-label` (Check uses "Mark Run as done"/"Mark Run as not done").
- Color contrast ≥ 4.5:1 for body text; `--muted` against `--surface` is checked at 4.6:1 in light, 5.1:1 in dark.
- Focus rings: `outline: 2px solid var(--accent)` with 2px offset.
- Heatmap cells have an aria-label per cell: `"May 6: done"` / `"May 6: 6 of 8"` etc.
- Drag-and-drop reorder must have a keyboard alternative (arrow-keys w/ a "move mode").

---

## 13. Telemetry

Emit one event per user action:
- `habit.created`, `habit.updated`, `habit.archived`, `habit.reordered`
- `habit_entry.toggled` (check), `habit_entry.count_set`, `habit_entry.scale_set`, `habit_entry.note_set`
- `habit.viewed_detail`, `habit.viewed_today`

Each event includes `{ habitId, kind, route }`.

---

## 14. Implementation notes for Cursor

- Mirror the existing prime app's folder layout. If it uses a `routes/` or `pages/` folder, drop a new `habits/` folder in there with `index.tsx`, `today.tsx`, `[id].tsx`, `archive.tsx`, plus a `components/` subfolder for the row primitives.
- Re-use the existing prime sidebar component; add the Habits nav item to its config (don't fork the sidebar).
- Re-use existing button, card, tab-pill, and tag components — DO NOT rewrite them. If you can't find them, ask the user where they live before building duplicates.
- All tokens already exist as CSS custom properties in the global stylesheet — don't redefine.
- Don't add any reference to `Project`, `projectId`, or "Linked project" anywhere in the Habits code, UI, types, API, or DB schema. The two domains are isolated.

---

## 15. Open questions for the user

1. Where should the user model live? Is there a `User.timezone` field already, or do we need to add one?
2. Are entries stored in Postgres (matches projects)? Confirm DB.
3. Do you want a `/habits/today` page **and** a default redirect from `/habits` → `/habits/today`, or is `/habits` itself the index?
4. New-habit modal: confirm the schedule picker UX (tabs vs. dropdown).
5. Should "Note" entries support markdown, or plaintext only in v1?
