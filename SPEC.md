# prime. — Sessions Feature Spec (v1.0)

## Overview

**prime.** is a personal time-tracking and project-pacing app for content creators. The first feature being built is **Sessions** — a system for tracking work on video projects, where each project is composed of tasks, and the user uses a timer to focus on tasks while the app helps them stay on pace toward a deadline.

This spec covers the **Sessions** feature only. Other features (notes, habits, chores, vlog) are out of scope for v1.

---

## Tech Stack

- **Frontend:** React (web app, mobile-friendly via responsive design / PWA)
- **Backend / Database:** Supabase (Postgres, Auth, real-time)
- **Hosting:** Vercel
- **Target devices:** Desktop browser, iPhone, iPad (PWA — "Add to Home Screen")

All time values are stored as **integers representing total seconds**. The UI converts to/from `hh:mm:ss` for display.

---

## Data Model

### `projects`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `user_id` | uuid (FK → auth.users) | |
| `name` | text | |
| `video_length` | integer (seconds) | The total length of the finished video. Used in scaling task calculations. |
| `due_date` | timestamptz (nullable) | Optional project deadline with date and time. |
| `buffer_modifier` | numeric | Multiplier (e.g. `1.2`, `2.5`, `12`). See Buffer Modifier section. |
| `pace_split_percentage` | numeric | 0–100. Default `0`. Per-project share of buffer-only estimate difference allocated into margin on each progress change. |
| `pace_margin_limit_seconds` | bigint (nullable) | Per-project max pace margin in seconds. `NULL` = unlimited. |
| `tag` | text (nullable) | Optional select-style tag. |
| `parent_id` | uuid (FK → projects, nullable) | When set, this row is a subproject. Single-level nesting only. |
| `created_at` | timestamptz | |

Parent projects (`parent_id IS NULL`) appear in the Projects table/cards. Subprojects have their own tasks, pace settings, and due dates, and inherit their parent's tag and series.

### `project_templates`

Mirrors the project hierarchy: top-level templates can have child templates via `parent_id` (single-level). Saving a parent project with subprojects as a template captures the full tree. Creating a project from a parent template also creates its subprojects.

### Project — calculated properties (computed at read time, not stored)

- **`total_task_length`** (seconds): sum of all related tasks' `task_length`.
- **`project_progress`** (seconds): sum of all related tasks' `calculated_progress`.
- **`remaining_progress`** (seconds): `total_task_length - project_progress`.

---

### `tasks`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `project_id` | uuid (FK → projects) | |
| `name` | text | |
| `status` | text | enum: `not_started`, `in_progress`, `complete` |
| `type` | text | enum: `scaling`, `scripting`, `custom`, `manual` |
| `current_progress` | integer | Stored as seconds (for timestamp-style tasks) or whole units (for custom tasks). Always an integer in DB. |
| Type-specific fields | see below | |
| `created_at` | timestamptz | |

#### Type-specific fields (nullable, only used by their type)

| Field | Type | Used by |
|---|---|---|
| `scaling_modifier` | numeric | `scaling` — real minutes to do 1 minute of `video_length` (e.g. `5.0` means 5 real min per 1 video min) |
| `scripting_modifier` | numeric | `scripting` — real minutes to do 1 minute of `script_length` |
| `script_length` | integer (seconds) | `scripting` |
| `unit_count` | integer | `custom` |
| `unit_length` | integer (seconds) | `custom` — real seconds per unit |
| `manual_length` | integer (seconds) | `manual` — total real seconds the task should take, before buffer |
| `video_rate` | numeric (nullable) | Planning-only (does not affect `task_length` / progress). `custom`: units per 1 minute of finished video. `scripting`: minutes of script per 1 minute of finished video. `0` = N/A (no direct correlation to video length). Unused by `scaling` / `manual`. |
| `subsplit_length` | integer | Default `60`. Seconds for timestamp-style tasks (`00:01:00`); whole units for `custom`. Used by censaySplit; does not affect `task_length` / progress. |
| `source_timecode_based` | boolean | Default `false`. Originates in Prime for external apps; does not affect `task_length` / progress. |

### Task — calculated properties (computed at read time)

- **`related_buffer_modifier`**: pulled from the parent project's `buffer_modifier`.
- **`task_length`** (seconds): see formulas below.
- **`calculated_progress`** (seconds): see formulas below.

#### Formulas by task type

| Type | `task_length` formula | `calculated_progress` formula | `current_progress` input type |
|---|---|---|---|
| **scaling** | `project.video_length * scaling_modifier * related_buffer_modifier` | `current_progress * scaling_modifier * related_buffer_modifier` | timestamp (hh:mm:ss → seconds) |
| **scripting** | `script_length * scripting_modifier * related_buffer_modifier` | `current_progress * scripting_modifier * related_buffer_modifier` | timestamp (hh:mm:ss → seconds) |
| **custom** | `unit_count * unit_length * related_buffer_modifier` | `current_progress * unit_length * related_buffer_modifier` | whole integer (number of units) |
| **manual** | `manual_length * related_buffer_modifier` | `current_progress * related_buffer_modifier` | timestamp (hh:mm:ss → seconds) |

> **Note on `current_progress`:** for `scaling`, `scripting`, and `manual`, the user is inputting *how far through the video / script / segment they are*. For `custom`, they're inputting *how many units they've completed* (e.g. lines recorded).

#### What the modifiers actually mean

- **`scaling_modifier`** — real minutes the user takes to do **1 minute of `video_length`** for this task. If it takes 5 real minutes to color-grade 1 minute of video, this is `5.0`.
- **`scripting_modifier`** — real minutes per 1 minute of `script_length`. Same idea but the reference is the script, not the final video.
- **`unit_length`** — real seconds it takes to complete one unit (e.g. one recorded line).
- **`manual_length`** — the user's flat estimate of total real seconds the task should take, before buffer.
- **`video_rate`** — planning-only link to finished `video_length`. For `custom`, how many units correspond to 1 minute of video. For `scripting`, how many minutes of script correspond to 1 minute of finished video. Use `0` for N/A when the task does not correlate to video length. Not used in length/progress formulas.
- **`buffer_modifier`** (project-level) — applied on top of all of the above. So `task_length` always represents the *buffered* total real time the task is expected to take.

---

### `pace_settings`

One row per project.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `project_id` | uuid (FK → projects, unique) | |
| `target_deadline` | timestamptz | When the user wants to be done. |
| `true_deadline` | timestamptz | The actual hard deadline. |

### Pace — calculated properties (computed live, not stored)

All times in seconds; `now()` is the current time in the user's timezone.

- **`estimated_completion`** (timestamp): `now() + project.remaining_progress`.
  - "If I keep going at the rate the timer assumes, this is when I'd finish."
- **`current_pace`** (seconds, signed): `target_deadline - estimated_completion`.
  - Positive = ahead of schedule. Negative = behind schedule.
  - Ticks down by 1 second every second (because `now()` ticks up).
- **`pace_margin`** (seconds, signed): `true_deadline - target_deadline`.
  - Positive = the target is earlier than the true deadline (you have buffer).
  - Negative = the target is *later* than the true deadline (overcommitted).
- **`current_pace_end`** (timestamp): `now() + current_pace`, which simplifies to `target_deadline - project.remaining_progress`.
  - Stable over time — only changes when `remaining_progress` or `target_deadline` changes. (Because `now()` and `current_pace` cancel each other out second-by-second.)

### `pace_split_settings`

One row per user. **Defaults for new projects** only — does not rewrite existing projects. Creating a project seeds `projects.pace_split_percentage` and `projects.pace_margin_limit_seconds` from this row when those fields are omitted.

| Field | Type | Notes |
|---|---|---|
| `user_id` | uuid (PK, FK → auth.users) | |
| `pace_split_percentage` | numeric | 0–100. Default `0`. Copied onto new projects. |
| `pace_margin_limit_seconds` | bigint (nullable) | Copied onto new projects. `NULL` = unlimited. Empty in Settings = off. |

Live progress allocation and margin capping use the **per-project** columns on `projects`, edited under Project Detail → Pace settings (Settings → Pace edits defaults only).

#### Progress → pace split allocation

When `current_progress` changes (UI or third-party sync), a DB trigger may adjust `target_deadline` and, when the margin limit applies, `buffer_modifier`. It never writes `true_deadline`. It reads `pace_split_percentage` and `pace_margin_limit_seconds` from the **project** row. Steps for the progress delta:

1. **True estimated time** (no buffer): `progress_delta × unbuffered_rate`
   - scaling: `scaling_modifier`
   - scripting: `scripting_modifier`
   - custom: `unit_length`
   - manual: `1`
   - compressed parent: sum of subtask `scaling_modifier`
2. **Buffer estimated time**: `true_estimated × project.buffer_modifier`
3. **Estimated time difference**: `buffer_estimated − true_estimated` (the portion added by buffer)
4. **Allocation**: `round((difference × project.pace_split_percentage / 100) / 60)` minutes would be **subtracted** from `target_deadline` (target moves earlier → margin grows). Rounding is half away from zero (Postgres `round(numeric)`). Progress decreases reverse the sign (target moves later).

Skipped when percentage is `0`, the project has no `pace_settings` row, progress delta is `0`, or the task's unbuffered rate is `0` (expanded parents / compressed subtasks — parent is counted instead).

#### Pace margin limit (margin-preserving rebalance)

Core identity (true fixed): `pace + margin = true_deadline − estimated_completion`, with `margin = true_deadline − target_deadline` and `pace = target_deadline − estimated_completion`.

When allocation minutes are **positive**, a project margin limit is set, and applying the full allocation would make `margin > project.pace_margin_limit_seconds`:

1. Compute the **desired pace** that the full normal split would have produced (post-progress remaining work at the current buffer, with `target` moved by the full allocation).
2. Run a **margin-preserving rebalance** anchored on `true_deadline` (not `due_date`):
   - `offset = project.pace_margin_limit_seconds + desired_pace`
   - `buffer_modifier = round(((true_deadline − now − offset) / remaining_unbuffered_hours) × 100) / 100` (must be finite and `> 0`)
   - `target_deadline = true_deadline − project.pace_margin_limit_seconds`
3. Result: margin equals the limit, pace matches the desired post-split pace (within rounding), `true_deadline` unchanged, and the missing sum is absorbed by a higher buffer.

This is equivalent to “rebalance for `(limit + desired_pace)` then set `target = true − limit`” (unlike the manual rebalance UI, which zeros margin by setting `target = true`).

**Does not apply** when:

- `project.pace_margin_limit_seconds` is `NULL` (unlimited) — plain split only
- allocation ≤ 0 (progress decrease / no-op) — never forces margin **up** to the limit; plain split only
- prospective margin after full alloc is still ≤ the limit — plain split; buffer unchanged
- rebalance cannot produce a valid positive buffer (no remaining unbuffered hours, non-positive buffer, etc.) — **fail soft**: apply the plain split allocation only; do not corrupt deadlines

---

## Buffer Modifier

The **buffer modifier** is a per-project multiplier that scales how "valuable" real time is for pace calculations. Examples:

- `bufferModifier = 1.0` → 1 hour of work moves pace by 1 hour.
- `bufferModifier = 2.5` → 1 hour of work moves pace by 2.5 hours.
- `bufferModifier = 12` → 2 hours of work moves pace by 24 hours.

This lets the user run a single global timer-driven pacing system across multiple projects with different intensities. A casual side project might be 1x; a daily-grind project might be 12x.

The buffer modifier is applied inside both `task_length` and `calculated_progress`, so pace ratios stay consistent within a project.

---

## Sessions Feature — UX

The Sessions feature lives on a **Timer page**. It is the place where the user actually does work and updates progress.

### Entry: Project selection

When the user opens a project, they see a "Start session" button (or similar) that takes them to the Timer page for that project.

### Timer page layout

The Timer page has two modes: **single-task mode** and **bulk timer mode**. The user lands in single-task mode by default, with a button at the top to switch to bulk timer mode.

#### Common elements (both modes)

- **Timer display** at the top.
  - Counts down from a user-set duration (e.g. 10:00 → 0:00).
  - When it hits zero, it turns **red** and counts **up** from `00:00`, indefinitely.
  - The timer is purely a focus aid. It does **not** modify any task progress, pace, or session data on its own. Nothing is auto-saved.
  - The timer duration **persists across sessions** as a user preference (last value used). It can be changed at any time before starting.
- **Start / Pause / Reset** controls.
- **Pace info** somewhere visible — at minimum, the current pace and estimated completion for this project (live values).
- **Bulk timer toggle button** at the top.

#### Single-task mode

- A **list or grid of all this project's remaining tasks** (status `not_started` or `in_progress`).
- The user clicks a task to select it. That task is now the "active" task for this session.
- Once a task is selected, the page shows:
  - The task's name, type, current progress, and `calculated_progress`.
  - An **estimated progress goal** for this session: "If you focus on this task for the full timer duration, you should reach `current_progress + X`." This is calculated once when the timer starts and **does not change** as time elapses or as the user updates progress. It's purely informational.
- **Clipboard listener (cmd+v / ctrl+v):**
  - When the user pastes anywhere on the page, the app reads the clipboard.
  - If the clipboard contains a string matching `hh:mm:ss` or `hh:mm:ss:ff`:
    - Parse `hh:mm:ss` as the new `current_progress` (in seconds).
    - **Ignore** the `:ff` (frame count from Premiere Pro) entirely.
    - Update the active task's `current_progress` immediately (write to Supabase).
  - If the clipboard doesn't match a timestamp pattern, do nothing (allow normal paste behavior in input fields).
  - Only active in single-task mode.
- For **`custom`-type tasks** (whole-integer progress), the cmd+v paste flow does not apply. The user updates progress via a number input on the page instead.

#### Bulk timer mode

- A button at the top of the Timer page toggles into bulk mode.
- Shows a list of **all in-progress and not-started tasks** for the project.
- Each task row shows:
  - Task name and type.
  - An **input box** pre-filled with the task's current `current_progress`.
  - The **estimated progress goal** for this task — "if you spent the whole timer session on this task, you'd reach X." Same rules as single-task mode (calculated once at timer start, never changes).
- The user can update any task's `current_progress` by editing its input box. Updates are saved to Supabase on blur (or on a save button — implementer's call, but blur is preferred for low friction).
- The cmd+v clipboard listener is **disabled** in bulk mode (because there's no single "active" task to apply it to).

### Session lifecycle

A "session" is **conceptual**, not stored. It begins when the user starts the timer and ends when they leave the page or click "complete session" (if such a button exists for the user's mental model).

**Nothing about a session is persisted.** No session records, no auto-applied progress, no logs. Every change to the database happens only because the user explicitly typed/pasted a value.

This is intentional: the timer is a focus tool, not a logger.

---

## Estimated Progress Goal — Calculation

### Conceptual model

The `scaling_modifier` and `scripting_modifier` represent **how many real minutes the user takes to complete 1 minute of `video_length` (or `script_length`) for that task type.**

- Example: if it takes you 5 real minutes to place music for 1 minute of finished video, your `scaling_modifier` is `5.0`.
- The `buffer_modifier` is then multiplied on top to add breathing room for pace.

This means `task_length` is the **total real time** the task is expected to take (already buffer-adjusted). So a session's "estimated progress goal" should be measured against `task_length`:

> **If the user works for `timer_duration_seconds` of real time on this task, they should knock `timer_duration_seconds` off the remaining `task_length`.**

That real-time chunk needs to be converted back into the units `current_progress` is stored in (which differs by task type) so it can be displayed as a goal value the user can compare against.

### Conversion: real seconds → `current_progress` units

For each task type, divide the timer duration by the multipliers that turn `current_progress` into `task_length` / `calculated_progress`:

| Type | `progress_delta` (amount to add to `current_progress`) |
|---|---|
| scaling | `timer_duration_seconds / (scaling_modifier * related_buffer_modifier)` |
| scripting | `timer_duration_seconds / (scripting_modifier * related_buffer_modifier)` |
| manual | `timer_duration_seconds / related_buffer_modifier` |
| custom | `floor(timer_duration_seconds / (unit_length * related_buffer_modifier))` |

The displayed **goal value** is:

```
goal_progress = current_progress_at_timer_start + progress_delta
```

### Worked example

- `video_length = 00:20:00` (1200s)
- `buffer_modifier = 3.0`
- `scaling_modifier = 3.0`
- → `task_length = 1200 × 3.0 × 3.0 = 10,800s` (3 hours of real work budgeted)
- Timer session = 9 minutes (540s)
- `progress_delta = 540 / (3.0 × 3.0) = 60s` = **1 minute of `current_progress`**

So if `current_progress` was `00:05:00` when the timer started, the goal display would read `00:06:00`.

### Rules

- The goal is calculated **once when the timer starts**, snapshotting the `current_progress` at that moment.
- It does **not** change as time elapses or as the user updates `current_progress` mid-session.
- It is purely informational — a target, not a constraint.
- For `custom` tasks, round down to whole units (you can't complete a fractional unit).

---

## Pace Page (companion view)

While not strictly part of "Sessions," the Timer page needs to surface pace info, and the user needs a place to configure pace. Suggested:

### Pace settings UI (per project)

- **"Set pace" button** with an input box next to it.
  - The input box is a number with a toggle for **minutes** or **hours**.
  - On click: `target_deadline = estimated_completion + input_value`.
  - This means: "set my target so I have X minutes/hours of buffer beyond what the timer says I need."
- **"Set target time" button** with a date+time input next to it.
  - On click: sets `target_deadline` directly to that date/time.
  - The pace adjusts so that `current_pace_end` equals the input (which it does automatically since `current_pace_end = target_deadline - remaining_progress`).
- Display of current `target_deadline`, `true_deadline`, `pace_margin`, `current_pace`, and `current_pace_end`.
- Field to set/edit `true_deadline`.

---

## Build Order (suggested for v1)

1. **Auth + project CRUD** — Supabase auth, create/list/edit/delete projects.
2. **Task CRUD with all 4 types** — make sure the type-specific fields and formulas all work. Build a small read-only "task summary" view that shows `task_length` and `calculated_progress` so you can verify formulas before building the timer.
3. **Project calculated properties** — `total_task_length`, `project_progress`, `remaining_progress`. Display on the project page.
4. **Pace settings + calculated properties** — get `current_pace`, `pace_margin`, `current_pace_end` working and ticking live in the UI.
5. **Timer page (single-task mode)** — task selection, timer display, countdown→red overflow, timer-duration persistence. No clipboard listener yet.
6. **Clipboard listener** — cmd+v → parse `hh:mm:ss(:ff)` → update active task.
7. **Estimated progress goal display.**
8. **Bulk timer mode.**
9. **Polish** — pace UI buttons ("set pace" / "set target time"), responsive design for iPhone/iPad, PWA manifest so it can be added to home screen.

---

## Open Questions / Decisions to Revisit

- **Timezone handling.** All pace math should run in the user's local timezone. Decide: store user timezone on the user profile, or always use the browser's local time. Recommend storing on profile so it's consistent across devices.
- **What does "remaining" mean for a `complete` task?** Assumed: `complete` tasks contribute their full `task_length` to `project_progress` (i.e. progress is forced to 100%) regardless of input. Confirm during build.
- **Negative `current_pace` display.** Render in red text with a leading minus sign (e.g. `-02:14:33`).
- **Floating-point on `buffer_modifier`.** Stored as `numeric` (Postgres) for precision. UI input should accept decimals.
- **Mobile cmd+v.** On iPhone/iPad, "cmd+v" doesn't exist the same way. Plan: detect paste via the `paste` event on the document, which works for both desktop and mobile long-press → paste. Test on iOS specifically.
