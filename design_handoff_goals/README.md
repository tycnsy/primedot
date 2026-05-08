# Handoff: Goals Feature for prime.

## Overview

A new top-level **Goals** module for the prime. personal life-management app, sitting alongside existing modules (Projects, Templates, Timer, Habits). It supports two parallel tracks:

1. **Long-term goals** — three shapes:
   - **Trend** — a measurement that should move toward a target (e.g. *"Lose 5 kg"*, *"Run 5K under 22:00"*). Latest value matters; pacing compared to a linear start→target line.
   - **Accumulation** — a total that grows toward a target (e.g. *"Save $2,000"*, *"Read 12 books this year"*). Sum of all logged contributions.
   - **Milestone** — an ordered list of discrete steps to complete (e.g. *"Ship beta"*, *"Plan trip"*).
2. **Daily / weekly recurring goals** — the existing habits surface, reframed as goals. Checkbox or count-based, recurring, tagged, can be standalone *or* link to a long-term goal (navigation only, no shared data).

Cross-references between any two goals are supported as **navigation shortcuts only** — they don't share progress.

---

## About the Design Files

The files in this bundle are **design references created in HTML** — a React + Babel inline prototype showing the intended look, layout, and interactions. **They are not production code to copy directly.**

The task is to **recreate these designs in the existing prime. codebase** (Vite + React + TypeScript + Tailwind + react-router-dom + a hand-rolled feature/store pattern, mirroring the existing Habits module). The HTML prototype is the visual + behavioural ground truth; implementation should follow the codebase's existing patterns and tokens.

## Fidelity

**High-fidelity.** The mockups are pixel-perfect with final colors, typography, spacing, and interactions. Recreate the UI faithfully using the existing Tailwind tokens in `src/index.css` and `tailwind.config.js`. Match the warm/light/dark theme system and the `--accent` token already in place.

---

## Codebase Mapping (prime.)

The existing Habits feature is the closest analogue and the recommended template. Mirror its structure exactly:

```
src/
  features/
    goals/
      types.ts            // see "Data Model" below
      store.ts            // Zustand or context — match what habits/ uses
      compute.ts          // trendStats / accumulationStats / milestoneStats
      seed.ts             // optional sample data for dev
  components/
    goals/
      GoalCard.tsx        // tile shown in the index grid
      GoalRow.tsx         // row in the Today checklist
      CheckSquare.tsx     // reuse from habits/Check.tsx if shape matches
      Counter.tsx         // reuse from habits/Counter.tsx
      RingProgress.tsx    // reuse from habits/RingProgress.tsx (already exists)
      TrendChart.tsx      // new — see "Charts"
      Donut.tsx           // new — for accumulation hero
      MiniBars.tsx        // new — accumulation 12-week sparkline
      MiniTrend.tsx       // new — small line for trend cards
      WeekStrip.tsx       // reuse from habits/WeekStrip.tsx
      MilestoneList.tsx   // ordered milestone checklist with timeline
      LogProgressModal.tsx
      NewGoalModal.tsx
      TagChip.tsx
      GoalTypeBadge.tsx
  pages/
    GoalsIndex.tsx        // the all-goals view (today preview + grid)
    GoalsToday.tsx        // dedicated daily checklist view
    GoalDetailLong.tsx    // dispatches by type {trend|accumulation|milestone}
    GoalDetailDaily.tsx   // detail for a recurring goal
```

Add routes in the existing router setup:
```
/goals                  → GoalsIndex
/goals/today            → GoalsToday
/goals/long/:goalId     → GoalDetailLong
/goals/daily/:goalId    → GoalDetailDaily
```

Add a **Goals** entry to the sidebar in `src/components/Layout.tsx` between Habits and any future modules. Use the same `NavLink` pattern as the other items.

---

## Data Model

```ts
// src/features/goals/types.ts

export type GoalType = 'trend' | 'accumulation' | 'milestone';
export type Schedule = 'daily' | 'weekly';
export type Kind = 'check' | 'count';
export type TimeOfDay = 'morning' | 'anytime' | 'evening';

export interface Tag {
  id: string;
  name: string;
  color: string;          // hex, e.g. '#5B7CFA'
}

export interface LogEntry {
  id: string;
  at: string;             // ISO datetime
  value?: number;         // omitted only for milestone-style notes
  note?: string;
}

export interface Milestone {
  id: string;
  name: string;
  dueDate: string | null; // ISO date
  done: boolean;
  doneAt: string | null;
}

interface GoalBase {
  id: string;
  name: string;
  description?: string;
  startDate: string;      // ISO date
  targetDate: string;     // ISO date
  tags: string[];         // tag ids
  relatedGoalIds: string[]; // navigation shortcuts (no shared data)
  archivedAt?: string | null;
}

export interface TrendGoal extends GoalBase {
  type: 'trend';
  startValue: number;
  targetValue: number;
  direction: 'up' | 'down';   // derived from start vs target
  unit: string;               // 'kg', '$', '%', 'min', ...
  logs: LogEntry[];
}

export interface AccumulationGoal extends GoalBase {
  type: 'accumulation';
  targetTotal: number;
  unit: string;
  logs: LogEntry[];           // each value is added to total
}

export interface MilestoneGoal extends GoalBase {
  type: 'milestone';
  milestones: Milestone[];    // ordered
  logs: LogEntry[];           // optional notes timeline
}

export type LongGoal = TrendGoal | AccumulationGoal | MilestoneGoal;

export interface DailyGoal {
  id: string;
  name: string;
  notes?: string;
  schedule: Schedule;
  kind: Kind;                 // 'check' or 'count'
  target?: number;            // for count
  unit?: string;
  timeOfDay?: TimeOfDay;
  tags: string[];
  linkedTo?: string;          // optional long-term goal id (navigation only)
  archivedAt?: string | null;
}

export type DayMark = 0 | 0.5 | 1; // miss / partial / hit
```

### Derived stats

Implement these as pure functions in `compute.ts`. The prototype implementation lives in `goals-data.jsx` (functions `trendStats`, `accumulationStats`, `milestoneStats`) — port directly:

- **`trendStats(goal)`** → `{ last, first, totalDelta, progressDelta, pct, days, daysIn, expected, onPace, aheadBy }`
  - `expected = startValue + totalDelta * (daysIn / days)` — the linear pace value for today
  - `onPace`: for `direction === 'down'`, `last <= expected`; otherwise `last >= expected`
- **`accumulationStats(goal)`** → `{ total, pct, remaining, days, daysIn, daysLeft, expected, onPace, pacePerDay }`
  - `pacePerDay = targetTotal / days`
- **`milestoneStats(goal)`** → `{ done, total, pct, next }` (`next` = first incomplete milestone)

---

## Screens

### 1. Goals Index (`/goals`)

**Purpose:** primary landing — see everything at a glance, filter, search.

**Layout** (max-width 1100px, centered, 28px top / 36px side padding):
1. **Page header**
   - Eyebrow: `PERSONAL` (uppercase, 11px, letter-spacing .08em, muted)
   - Title: *Goals* (28px, weight 600, -0.02em)
   - Subtitle: `<N> long-term · <M> recurring · <weekday, date>`
   - Right side: `[Today view]` ghost button + `[+ New goal]` primary button
2. **Tab + search row**
   - Segmented tabs: All · Trend · Accumulation · Milestone · Daily
   - Search input (right-aligned, 220px, with 🔍 icon)
3. **Tag filter chips** — `All tags` + one chip per tag, single-select
4. **Today preview card** (shown when tab is `all` or `daily`)
   - Big ring progress (64px) on the left
   - Middle: "TODAY" eyebrow, `<doneCount> of <total> daily goals done`, sublabel "Up next: A · B · C" or "All daily goals checked. Nice."
   - Click → navigates to `/goals/today`
5. **"Long-term goals" section divider** — small uppercase label, hairline rule continuation to the right
6. **Grid of `GoalCard`s** — `repeat(auto-fill, minmax(320px, 1fr))`, gap 14px

### 2. Today (`/goals/today`)

**Purpose:** quick daily / weekly check-in for recurring goals.

**Layout:**
1. Header with breadcrumb back to Goals
   - Eyebrow: full date in caps (e.g. `WEDNESDAY, MAY 7`)
   - Title: `Good morning.` / `afternoon.` / `evening.` based on hour
   - Subtitle: `<doneCount> of <total> daily goals checked off · keep going`
   - Right: ring progress (64px) showing today completion
2. Segmented Today / Week / Month + keyboard-shortcut hints (`N`, `␣`, `/`)
3. Three time-of-day sections (Morning 06–11, During the day, Evening 20–23) — each is a `card` with:
   - Section header: name + range subtle + done count `(X/Y)` on the right
   - Stack of `GoalRow`s
4. Centered "Quick-add goal" primary button at the bottom (with `N` kbd hint)

Empty time-of-day sections are hidden entirely.

### 3. Long-term goal detail (`/goals/long/:goalId`)

Dispatches by `goal.type`. Shared shell:
1. Page header with breadcrumb, type badge + tag chips eyebrow, name, description
   - Right side: `[Edit]` `[Archive]` ghost + `[+ Log progress]` primary
2. **Hero stat card** — large numeric headline left, pace/ring badge right
3. Segmented tabs: Overview · Log · Related · Settings
4. Two-column overview (`1.6fr 1fr`): primary visualization on the left, related goals + recent log on the right

#### Trend overview body
- "Progress" card with chart legend (`■ actual` solid, `┄ pace` dashed, `· hover dots for notes`) and **TrendChart** (height 280)
- Stats card with 4 columns: Latest (accent) · Change · Logs · Days in

#### Accumulation overview body
- Hero card: **Donut** (180px, stroke 16, big % center) on left + on right: "Weekly contributions (last 12w)" `MiniBars` + 3 stats (To go · Days left · Pace)

#### Milestone overview body
- "Milestones" card with subtle hint "tap to toggle · drag to reorder"
- Stack of milestone rows (see `MilestoneList`)

### 4. Daily goal detail (`/goals/daily/:goalId`)

Lighter — header (badge + tag chip + name + meta), card showing last 7 days `WeekStrip` and (if linked) a clickable card pointing to the parent long-term goal, optional notes card.

---

## Components — exact specs

### Design tokens

All in `goals-styles.css`. The values are already aligned with prime.'s warm/dark theme system. Key tokens:

```css
--bg, --surface, --surface-2, --border, --fg, --muted    /* RGB triplets */
--accent (default 91 124 250 → #5B7CFA)
--success (33 160 106), --warn (209 119 33), --danger (220 75 60)

--radius-sm: 6px;  --radius: 10px;  --radius-lg: 14px;
--shadow-card, --shadow-pop
--pad-card: 16px (cozy 20 / compact 12)
--row-h: 44px (cozy 50 / compact 36)
```

Typography: ui-sans-serif system stack, base 13.5px / 1.45, font-feature-settings `"ss01", "cv11"`. Headings use letter-spacing `-0.02em` to `-0.01em`. Tabular numerics on all stats.

### CheckSquare
- 18×18, 5px radius, 1.5px border, accent fill + white check when on
- Reuse from `src/components/habits/Check.tsx` if compatible

### Counter (count-based daily)
- Pill with −/+ buttons either side of `value/target unit`
- Reuse from `src/components/habits/Counter.tsx`

### RingProgress
- Conic gradient track, accent fill, hollow center showing `XX%`
- Reuse `src/components/habits/RingProgress.tsx` (already exists)

### GoalTypeBadge
- Small uppercase pill, 10.5px, weight 600, .06em tracking, 1px tinted border
- Type-specific tints:
  - `trend` → `#2563eb` text, `rgba(37,99,235,.10)` bg
  - `accumulation` → `#21A06A` text, `rgba(33,160,106,.10)` bg
  - `milestone` → `#7B5EE6` text, `rgba(123,94,230,.10)` bg
  - `daily / weekly` → muted text on `--surface-2`
- Each renders a tiny inline SVG icon to the left

### TagChip
- Rounded 999px pill, 7px dot of the tag color, name, optional × remove
- 11px, 500 weight, `--surface-2` bg, hairline border

### TrendChart
SVG line chart, height 280 in detail / 66 in card preview.

- Dimensions paddings: `padL=44, padR=16, padT=18, padB=28`
- **Y axis**: 5 horizontal gridlines (dashed `2 4`, `--border`), values labeled at left, range = `[min−15%pad, max+15%pad]` over `(startValue, targetValue, ...logs)`
- **X axis**: domain is `[startDate, targetDate]`. Three labels: start, midpoint, target.
- **Pace line**: dashed `5 5`, `--muted`, .7 opacity, from `(startDate, startValue)` to `(targetDate, targetValue)`. Endpoints have small open circles. Right endpoint annotated with `target <value><unit>`.
- **Today line**: vertical dashed line at current date, accent color, .5 opacity, label "now" at top.
- **Area fill**: linear gradient from `accent @ 0.20` top → 0 bottom.
- **Line**: 2px stroke, accent, round caps + joins.
- **Dots**: r=4 (r=6 on hover), accent fill, `--surface` 2px ring stroke. Notes get a small black satellite dot at top-right.
- **Tooltip**: appears above hovered dot. Dark `--fg` background, `--bg` text, value (bold tabular) / formatted date / note. CSS triangle pointer.

Implement on raw SVG (no chart lib). Resize-observe the wrapper for responsive width. The prototype's source is `goals-charts.jsx` → `TrendChart`.

### Donut
SVG circle with `stroke-dasharray` for arc. 180×180 default, stroke 14–16. Center shows `XX%` (28px, 600) and small sublabel below.

### MiniBars
12 bars, accent fill (or `--surface-2` for empty weeks), 1.5px radius, max-normalized. 320×56 in body, 140×36 in cards.

### MiniTrend
Compact version of TrendChart for cards — just pace line (dashed), area, line, dots. No axis labels. Renders responsively in the card preview area.

### Page header / Breadcrumb
- Crumb is a tiny ghost button: `← Goals`, 12px, muted, hover→fg
- Eyebrow can be plain text OR an inline-flex of `<GoalTypeBadge> <TagChip>...`

### GoalCard (index tile)
Card with hover lift (`translateY(-1px)`, deepen border, larger shadow). Layout column:
- Top row: `GoalTypeBadge` left, up to 2 `TagChip`s right
- Goal name (16px, 600)
- Big stat line — type-specific:
  - **trend**: `<last><unit>` (22px, 600, tabular) + `→ <target><unit> by <date>` muted
  - **accumulation**: `<total>` + `/ <targetTotal> <unit>` muted
  - **milestone**: `<done>/<total> milestones`
- Preview region:
  - **trend** → `MiniTrend` height 66
  - **accumulation** → 8px progress track + below it `<X%>` left, "<remaining> to go" right
  - **milestone** → 8px success-tinted progress track + a thin row of segments (one per milestone, 5px tall, accent if done else surface-2)
- Bottom row (auto): pacing pill on the left, `[+ Log]` secondary button right (stops propagation, opens log modal pre-filled with this goal)

### GoalRow (Today list)
Grid `auto 1fr auto auto`, gap 12, min-height `--row-h`, hover `--surface-2/.55`.
- Slot 1: `CheckSquare` (or auto-derives from count meeting target)
- Slot 2: name + linked-goal chip (link icon + name) + meta line (schedule · target · tag)
- Slot 3: streak — flame icon + count, accent if > 0 else muted
- Slot 4: `Counter` for count-based, nothing for check-based
- Strikethrough name when done

### MilestoneList
Stack of rows, each:
- 24px circle showing index number (or check icon if done)
- `CheckSquare`
- Name + meta (`Due <full date> · <relative>` or "No due date"; `· completed <relative>` when done)
- `…` icon button on right
- Done rows: line-through name, accent-filled circle

### NewGoalModal
2-step modal (max-width 560):
1. **Step 1 — type**: three large stacked option cards. Each shows `GoalTypeBadge` + name + 1-line description + italic example. Active card: 1.5px accent border, accent-tinted bg, 3px focus ring.
2. **Step 2 — details**: name, description, then type-specific fields:
   - **Trend**: 3 columns — Start value · Target value · Unit
   - **Accumulation**: 2 columns — Target total · Unit
   - **Milestone**: editable ordered list (number · name input · date input · remove ×); `+ Add milestone` ghost
   - All: target date, tag chip multi-select
- Footer: Cancel · ← Back (step 2) · Continue / Create goal (primary). Create disabled until required fields valid.
- Wires to `addLongGoal` and immediately navigates to the new goal's detail.

### LogProgressModal
- Big numeric input for the value (autofocus, 18px, tabular) — labeled "Current value (unit)" for trend, "Amount to add (unit)" for accumulation. Hidden for milestone.
- Date picker (defaults to today)
- Note textarea with subtle hint "Notes show up as dots on the chart — hover to read them later." (trend only)
- Footer: Cancel ghost / Save entry primary

### Modal shell
- Backdrop: rgba(0,0,0,.35), 2px backdrop-blur
- Modal: 540px, `--surface` bg, 14px radius, drop shadow, fade+pop entry animation (.14s ease-out)
- ESC closes
- Click backdrop closes (stop propagation on inner click)

---

## Interactions & Behavior

### Keyboard
- `N` anywhere (outside text inputs) → open New Goal modal
- `␣` on focused goal row → toggle check
- `/` → focus search
- `Esc` → close any open modal

### Animations
- Page transitions: `.fade-in` keyframe, opacity 0→1 over .18s ease-out
- Modal enter: combined fade + scale(.96)→1 + translateY(6px)→0 over .14s
- Card hover: translateY(-1px) + border-color shift + shadow upgrade, .12s
- Counter / progress fill width: .3s ease

### Empty / loading / error states
- Empty filter result: card-shaped row spanning full grid, "No goals match. Try clearing filters."
- Empty time-of-day section on Today: hidden entirely
- Empty log: "No entries yet." muted
- Modal create-button disabled until required fields valid

### Cross-references
A goal stores `relatedGoalIds: string[]`. Display as clickable rows in a "Related goals" card on detail screens. Clicking navigates to that goal — there is **no shared data**. Dailies can also store `linkedTo: string` pointing to a long-term goal — same navigation-only semantics, just simpler (one parent).

### Streaks
- Check-based daily: increment streak on toggle-on, decrement on toggle-off (clamp ≥ 0)
- Count-based daily: streak increments only when count crosses `target`; decrements if count drops below target after having crossed
- Mirror the existing Habits streak logic in the codebase; promote it to a shared util if duplicated

---

## Tweakable / Settings (optional)

The prototype exposes a Tweaks panel for design exploration. For production, expose a subset under app preferences:
- **Theme** light / dark — already in prime.
- **Density** cozy / comfortable / compact — `data-density` on `<html>` swaps `--pad-card`, `--row-h`, `--gap-row`
- **Show pace line on charts** — toggle the dashed start→target line on TrendChart
- **Index layout** grid / list — toggle the index grid template

---

## Design Tokens (full table)

```
COLORS (rgb triplets, used as `rgb(var(--token))` or `rgb(var(--token) / .X)`)
--bg            light: 250 250 248   dark: 16 17 20
--surface       light: 255 255 255   dark: 24 25 29
--surface-2     light: 244 243 240   dark: 32 33 38
--border        light: 224 222 217   dark: 48 49 54
--fg            light: 24 24 27      dark: 240 241 244
--muted         light: 113 113 122   dark: 155 158 168
--accent        91 124 250 (default — overridable)
--success       33 160 106
--warn          209 119 33
--danger        220 75 60

RADIUS
--radius-sm 6px ; --radius 10px ; --radius-lg 14px

SHADOWS
--shadow-card: 0 1px 0 rgb(0 0 0 / .015), 0 1px 2px rgb(0 0 0 / .04)
--shadow-pop:  0 8px 32px -8px rgb(0 0 0 / .18), 0 2px 6px rgb(0 0 0 / .06)

SPACING / SIZING
--pad-card: 16px (cozy 20 / compact 12)
--row-h:    44px (cozy 50 / compact 36)
--gap-row:  6px  (cozy 10 / compact 2)

TYPOGRAPHY
font-family: ui-sans-serif system stack
base 13.5px / 1.45
features: ss01, cv11
H1 28px / 600 / -0.02em
Card titles 16px / 600 / -0.01em
Section labels 11px / 600 uppercase / .06–.08em tracking
Stat values 19–32px / 600 / tabular-nums
```

---

## Sample Data

`goals-data.jsx` contains representative seed data:
- 3 long-term goals (one of each type) with ~10 logs each spread across realistic dates
- 6 daily goals across morning / anytime / evening, mix of check + count, two linked to long-term goals
- 5 default tags with prime.-warm hex colors
- 7-day history per daily goal
- Today's entries (a few pre-checked)

Port this into `seed.ts` for dev. Replace with real persistence (the existing prime. storage layer — match Habits') for production.

---

## Files in this Bundle

- `Goals.html` — entry point, open in a browser to see the live prototype
- `goals-styles.css` — design tokens + all component CSS (this is the visual ground truth)
- `goals-data.jsx` — types as JS, sample data, **`useGoalsStore` hook**, and the three `*Stats` derived metric functions (port `trendStats`, `accumulationStats`, `milestoneStats` directly)
- `goals-controls.jsx` — `Icon` set, `CheckSquare`, `Counter`, `RingProgress`, `TagChip`, `GoalTypeBadge`, `WeekStrip`, `Modal`
- `goals-charts.jsx` — `TrendChart`, `Donut`, `Sparkline`, `MiniBars`
- `goals-screens-shell.jsx` — `Sidebar`, `PageHeader`, `TodayScreen`, `DailyGoalRow`
- `goals-screens-index.jsx` — `IndexScreen`, `LongGoalCard`, `MiniTrend`, `TodayPreviewCard`
- `goals-screens-detail.jsx` — `LongGoalDetail` (dispatches by type), `TrendBody`, `AccumulationBody`, `MilestoneBody`, `RecentLogCard`, `FullLog`, `LogProgressModal`, `DailyGoalDetail`
- `goals-app.jsx` — top-level `App`, routing state, `NewGoalModal`, Tweaks bindings
- `tweaks-panel.jsx` — design-time tweaks panel (don't ship; for reference only)

To open the prototype locally: open `Goals.html` directly in any modern browser. No build step needed.

---

## Suggested Build Order

1. **Types + store + compute** — `features/goals/types.ts`, `store.ts` (mirror `features/habits/store.ts`), `compute.ts` (port the three stats functions verbatim).
2. **Routing + sidebar entry** — wire the four routes, add the "Goals" nav item, add the in-Goals subnav (Today / All goals).
3. **Index page** — `GoalsIndex.tsx` with tabs, search, tag chips, today preview card, and an empty grid. Verify filters work before styling cards.
4. **GoalCard** + the three preview visualizations (`MiniTrend`, accumulation progress + remaining, milestone segments). Test with seed data.
5. **Today page** — port `GoalsToday.tsx` with time-of-day sections, `GoalRow` (start by reusing/adapting `HabitRow.tsx`).
6. **Long-term detail** — shell first (header, hero, tabs), then bodies in this order: trend (the most complex — get `TrendChart` right) → accumulation → milestone.
7. **Modals** — `LogProgressModal` first (it's used from many places), then `NewGoalModal`.
8. **Daily detail** — small page, port from `HabitDetail.tsx`.
9. **Density / theme / pace-line preference** — if scope allows.
10. **Replace seed with real persistence**.

---

## Notes

- The prototype renders inside its own root and uses inline `<script type="text/babel">`. **Don't** ship that pattern — convert to TSX following the codebase conventions.
- `tweaks-panel.jsx` is a design-time scaffold only. Don't port it.
- The stat functions in `compute.ts` should be **pure** and unit-tested. They're cheap to test and easy to get subtly wrong (especially the on-pace direction logic for trends with `direction: 'down'`).
- All money/quantity displays should use `Intl.NumberFormat` for proper localization rather than the prototype's `toLocaleString()` shortcuts.
- Consider TypeScript discriminated unions on `LongGoal` (already structured this way in the type definitions above) for exhaustive switch on `goal.type` in detail dispatch — it'll catch missed cases at compile time.
