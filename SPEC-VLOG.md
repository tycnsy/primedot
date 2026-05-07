# prime. vlog — Spec Sheet (Web App, v1)

A vlog planning module that lives inside the existing **prime** project-management web app. This spec describes the **web (desktop) version only**. Mobile / iPad come later.

> **Visual reference:** `prime vlog.html` in this project. The HTML mock is the source of truth for layout, spacing, and color. This document captures the data model, behavior, and component contracts.

---

## 1. Goals & non-goals

**Goals**
- Add a fifth top-level area to prime: **Vlog** (alongside Projects, Templates, Timer, Habits).
- Capture inspiration: pinned **links** (URLs with metadata), **photos**, and short **video clips**, all in one masonry board.
- Plan shoots with **shot lists** — ordered, sectioned, checkable lists of shots.
- Reuse plans with **shot list templates** — save any list as a template, instantiate any template as a fresh list.
- Match the existing prime visual system 1:1 — no new design language.

**Non-goals (v1)**
- No mobile or tablet UI (separate spec later).
- No video production status tracking (Idea / Shooting / Editing / Posted) — out of scope.
- No platform tracking (YouTube / TikTok / Reels) — out of scope.
- **No linkage to projects.** Vlog is a personal-creative domain, separate from work projects. Do not surface project pickers, project IDs, or project metadata.
- No editor / timeline / cut-list features — this is planning, not production.
- No social / sharing / collaboration features.
- No native uploader pipeline beyond drag-and-drop + paste-link in v1 (no transcoding, no CDN preroll).

---

## 2. Visual system (inherit from prime)

All tokens already exist in the prime app — re-use, don't redefine. See SPEC.md §2 for the table.

- Font: **Inter** 400/500/600. Mono: **JetBrains Mono** for shot durations / timecodes / kbd hints.
- Radii: `--r-1` … `--r-4` (6 / 10 / 14 / 18 px).
- Card pattern: `--surface` background, 14px radius, 22–26px padding.
- Tab pill, segmented control, tag chip, button, sidebar nav-item: re-use existing prime components.
- Pin tiles use a 10px (`--r-2`) radius — slightly tighter than the page-level cards so they read as media, not chrome.

---

## 3. Information architecture

```
/vlog                            # default → /vlog/inspiration
/vlog/inspiration                # Inspiration board (default landing)
/vlog/lists                      # All shot lists (overview) + active list detail
/vlog/lists/:listId              # Single shot list (focused)
/vlog/templates                  # Templates gallery
/vlog/templates/:templateId/edit # Edit a template (modal, not a page)
/vlog/new-list                   # New shot list modal (triggered from any view)
/vlog/new-pin                    # New pin modal (triggered from any view, or paste)
```

Add **Vlog** as the 5th item in the existing left sidebar (after Habits), with this icon:
```svg
<svg viewBox="0 0 14 14" fill="none">
  <rect x="1" y="3" width="9" height="8" rx="1.4" stroke="currentColor" stroke-width="1.4"/>
  <path d="M10 6l3-1.5v5L10 8" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
</svg>
```

The page itself uses three top-level tabs in a `tab-pill`: **Inspiration · Shot lists · Templates**.

---

## 4. Data model

```ts
type PinKind = 'link' | 'photo' | 'video';

interface Pin {
  id: string;
  userId: string;
  kind: PinKind;

  // link kind
  url?: string;
  source?: string;             // e.g. "YouTube · 14:22", "Are.na · 42 blocks"
  ogImage?: string;            // server-fetched preview image (optional)

  // photo / video kind
  assetUrl?: string;           // CDN-hosted media
  width?: number;
  height?: number;             // intrinsic dimensions — drives masonry tile height
  durationSec?: number;        // 'video' kind only

  title: string;               // 1–120 chars; user-editable, OG-derived for links
  tag?: string;                // single freeform tag, e.g. "lighting", "mood"
  tags?: string[];             // multi-tag list (v1.1+)

  createdAt: string;           // ISO
  archivedAt: string | null;
}

interface ShotList {
  id: string;
  userId: string;
  title: string;               // 1–120 chars
  templateId: string | null;   // if instantiated from a template
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  shots: Shot[];               // ordered; section grouping derived from shot.section
}

interface Shot {
  id: string;
  listId: string;
  order: number;
  section: string;             // freeform section label, e.g. "Establishing", "Walking"
  title: string;               // 1–200 chars; the shot description
  durationSec: number | null;  // optional; shown as "8s", "0:12"
  location: string | null;
  notes: string | null;        // gear, lens, framing notes
  thumbnailPinId: string | null; // optional: link to a Pin used as ref
  done: boolean;
  doneAt: string | null;
}

interface ShotListTemplate {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  shots: TemplateShot[];       // ordered; same shape as Shot but no done/doneAt
  uses: number;                // server-incremented on instantiate
  createdAt: string;
  updatedAt: string;
}

interface TemplateShot {
  id: string;
  order: number;
  section: string;
  title: string;
  durationSec: number | null;
  location: string | null;
  notes: string | null;
}
```

**Constraints**
- A `Shot.section` is just a string — sections aren't a separate entity. Re-grouping happens client-side by stable section order (first-seen).
- `durationSec` < 60 renders as `Ns`; `≥ 60` renders as `M:SS`.
- Templates and lists are isolated: editing a template does **not** retroactively change lists already instantiated from it.

---

## 5. Screens

### 5.1 Inspiration (`/vlog/inspiration`) — default landing
**Layout** (centered column, max-width 1080px):
1. Crumb: `← Home`
2. H1: `Vlog`
3. Subtitle: `Inspiration, shot lists, templates · {pinCount} pins · {activeListCount} active lists`
4. Right-aligned actions: `Save link` · `Upload` · `+ New shot list` (primary)
5. Tab pill: `Inspiration | Shot lists | Templates`
6. Right-aligned **segmented filter**: `All | Links | Photos | Videos` (only on Inspiration tab)
7. Right of segmented: keyboard hints: `V paste link · N new`
8. **Masonry grid** — 4 columns, 12px gutter, items distributed by current shortest column (greedy fit). Each item is a `PinCard`.
9. Below the grid: a dashed-border drop zone — `Drop photos / videos here, or paste a link with ⌘V to pin it`. Always visible, inert when not hovered/dragging.

**Behavior**
- Drag-and-drop image/video files anywhere on the inspiration tab → upload as `photo` or `video` pin.
- Paste (⌘V / Ctrl-V) a URL anywhere on the page → opens **New pin** modal pre-filled. Server resolves OG metadata (title, source, og:image).
- Click a `PinCard` → opens a lightbox-style detail (modal): full-size preview, title, tag, source/url, copy-link, archive.
- Right-click a card → quick menu: Copy link, Edit, Archive.
- Hold ⌥/Alt + drag a card → reorder pins (manual sort; otherwise newest-first).
- Filter is purely client-side; URL persists `?filter=links`.

### 5.2 Shot lists (`/vlog/lists`)
**Layout** (max-width 1080px):
1. Same page chrome (crumb / H1 / actions / tab pill).
2. **All lists** card: rows of `ShotListSummary` — title, "{done} of {count} shots · updated {when} · from {templateName}", a 120px progress bar, percent complete, more-menu.
3. **Active list detail** below: H3 with title, "{done} / {count} shots · from "{templateName}" template", right-aligned `Save as template` button.
4. The active list body is rendered in **one of four styles** (see §6.3). The chosen style is per-list user preference (`ShotList.viewStyle`, persisted) — defaults to `cards`.

**Behavior**
- Clicking a list row in the All-lists card swaps the active list detail without route change (URL updates to `/vlog/lists/:id`).
- View-style switcher lives in the active-list header (segmented `Checklist · Cards · Storyboard · Table`).
- Toggling a shot's `Check` is optimistic; the All-lists progress bar animates in lockstep.

### 5.3 Templates (`/vlog/templates`)
**Layout** (max-width 1080px):
1. Same page chrome.
2. **Grid of template cards** — 3 columns, 14px gap. Each card:
   - "Template" eyebrow + title
   - "{shotCount} shots · used {uses} times"
   - bullet list of section labels (max 5 visible, then "+N more")
   - Primary `Use template` action + `Edit` ghost button
3. Final cell is a dashed-border **New template** card.

**Behavior**
- `Use template` → instantiates a new `ShotList` from the template, navigates to `/vlog/lists/:newId`.
- `Save as template` (from any list header) → modal with title (default = list title) + description; on submit, snapshot current shots as `TemplateShot[]`, store `templateId` on the list (one-way reference), redirect to `/vlog/templates`.

---

## 6. Components

All components are pure / presentational unless noted.

### 6.1 `PinCard`
```ts
interface PinCardProps {
  pin: Pin;
  onOpen?: () => void;
}
```
- **Link**: `card` with link-icon row showing trimmed URL (muted, 11px), title (13.5px / 500), source caption (11.5px / muted-2). 14px padding, 10px radius.
- **Photo / Video**: aspect-true tile sized by `pin.height` (or intrinsic ratio scaled to column width). Background = dominant tone (server-extracted) or a placeholder tone. Subtle 135° stripe pattern overlays at low opacity until media loads.
- **Video badge**: top-left pill `▶ 0:08` in mono.
- **Caption gradient**: bottom 40px of media tiles fade to `rgba(0,0,0,0.55)` with white title + uppercase tag.
- All tiles 10px radius (`--r-2`).

### 6.2 `ShotListSummary` (one row in the all-lists card)
```ts
interface ShotListSummaryProps {
  list: ShotList & { doneCount: number };
  onClick: () => void;
}
```
- Reuses the `.habit-row` grid pattern: `[title+meta] [bar 120px] [percent pill] [more]`.
- Percent text turns `--positive` at 100%.

### 6.3 Shot-list view styles
The active list body renders **one of four** components based on `viewStyle`:

#### `ShotListChecklist` — Variant A
- One `card` containing all shots, grouped by section.
- Section header: `label-tiny`.
- Row: `Check` (size 18) + title (line-through when done) + meta line "{location} · {notes}" + duration tag (mono).
- Lightest visual weight; fastest to scan.

#### `ShotListCards` — Variant B (default)
- 3-column grid of cards. Each card: 130px image header + body.
- Image header: dominant-tone placeholder, shot-number pill (top-left, mono), `Check` (top-right), duration pill (bottom-right).
- Body: section eyebrow + title (with line-through when done) + "{location} · {notes}".
- Done shots get `opacity: 0.55`.
- Best balance of scannability + visual richness.

#### `ShotListStoryboard` — Variant C
- Single card, vertical list of full-width rows.
- Each row: 200×112 thumbnail (left) + content (flex 1) + check (right).
- Thumbnail shows a large mono shot-number overlay (24px, weight 600, with text-shadow) and duration pill.
- Content: section + location chips, 15px / 500 title, multiline notes.
- Most cinematic; matches a director's storyboard.

#### `ShotListTable` — Variant D
- Single card, header row + data rows.
- Columns: `[Check 28] [# 36 mono] [Shot flex] [Section 110] [Location 130] [Dur 60 right] [more 24]`.
- Densest; best for long lists / data review.

All four variants share the same data and the same `Check` toggle behavior; switching between them is non-destructive.

### 6.4 `TemplateCard`
```ts
interface TemplateCardProps {
  template: ShotListTemplate;
  onUse: () => void;
  onEdit: () => void;
}
```
- "Template" eyebrow + title + `{shots} shots · used {uses} times` meta.
- Section list with 4px accent dot before each label, 1px top border between rows.
- Bottom action row: primary `Use template` (flex 1) + ghost `Edit`.

### 6.5 Modals
- **NewPinModal** — fields: URL (paste-detected) **OR** file drop, title (auto-fill from OG), tag. Submit: `⌘/Ctrl + Enter`. Esc to cancel.
- **NewListModal** — fields: title, optional `Start from template` picker (defaults to "Blank").
- **SaveAsTemplateModal** — fields: title (defaults to list title), description (optional). Confirms snapshot is one-way.
- **EditShotModal** — opened from any shot row; fields: section, title, duration, location, notes, optional thumbnail pin.

---

## 7. State / data hooks

### `usePins(filter?: PinKind | 'all')`
```ts
{
  pins: Pin[];                 // active, newest-first
  isLoading: boolean;
  error: Error | null;
  createPin(input: NewPin): Promise<Pin>;
  updatePin(id: string, patch: Partial<Pin>): Promise<Pin>;
  archivePin(id: string): Promise<void>;
  reorderPins(ids: string[]): Promise<void>;
}
```

### `useShotLists()`
```ts
{
  lists: ShotList[];           // active, updatedAt desc
  isLoading: boolean;
  createList(input: { title: string; templateId?: string }): Promise<ShotList>;
  updateList(id: string, patch: Partial<ShotList>): Promise<ShotList>;
  archiveList(id: string): Promise<void>;
}
```

### `useShotList(listId: string)`
```ts
{
  list: ShotList;
  isLoading: boolean;
  toggleShot(shotId: string): Promise<void>;
  updateShot(shotId: string, patch: Partial<Shot>): Promise<Shot>;
  addShot(input: NewShot): Promise<Shot>;
  reorderShots(orderedIds: string[]): Promise<void>;
  removeShot(shotId: string): Promise<void>;
  saveAsTemplate(input: { title: string; description?: string }): Promise<ShotListTemplate>;
}
```

### `useTemplates()`
```ts
{
  templates: ShotListTemplate[];
  createTemplate(input: NewTemplate): Promise<ShotListTemplate>;
  updateTemplate(id: string, patch: Partial<ShotListTemplate>): Promise<ShotListTemplate>;
  deleteTemplate(id: string): Promise<void>;
  instantiateTemplate(id: string, opts?: { title?: string }): Promise<ShotList>;
}
```

All mutations are **optimistic**: update local cache immediately, rollback on server error with a toast.

---

## 8. API endpoints

```
GET    /api/vlog/pins                          → Pin[]                (active, ?filter=link|photo|video)
POST   /api/vlog/pins                          → Pin                  (multipart for files; JSON for links)
PATCH  /api/vlog/pins/:id                      → Pin
POST   /api/vlog/pins/:id/archive              → 204
POST   /api/vlog/pins/reorder                  → 204     body: { orderedIds: string[] }
GET    /api/vlog/pins/og?url=...               → { title, source, ogImage }   (link metadata helper)

GET    /api/vlog/lists                         → ShotList[]           (active)
POST   /api/vlog/lists                         → ShotList             body: { title, templateId? }
GET    /api/vlog/lists/:id                     → ShotList             (with shots inlined)
PATCH  /api/vlog/lists/:id                     → ShotList
POST   /api/vlog/lists/:id/archive             → 204
POST   /api/vlog/lists/:id/save-as-template    → ShotListTemplate     body: { title, description? }

POST   /api/vlog/lists/:id/shots               → Shot
PATCH  /api/vlog/lists/:id/shots/:shotId       → Shot
DELETE /api/vlog/lists/:id/shots/:shotId       → 204
POST   /api/vlog/lists/:id/shots/reorder       → 204     body: { orderedIds: string[] }

GET    /api/vlog/templates                     → ShotListTemplate[]
POST   /api/vlog/templates                     → ShotListTemplate
GET    /api/vlog/templates/:id                 → ShotListTemplate
PATCH  /api/vlog/templates/:id                 → ShotListTemplate
DELETE /api/vlog/templates/:id                 → 204
POST   /api/vlog/templates/:id/instantiate     → ShotList             body: { title? }
```

- All routes scoped to current user; reject cross-user with 404.
- File uploads: signed-URL pattern — `POST /api/vlog/pins/upload-url` returns `{uploadUrl, assetUrl}`, client PUTs to S3, then `POST /api/vlog/pins` with the resolved `assetUrl`.
- Image dimension extraction happens server-side on first fetch of `assetUrl` and is cached on the `Pin`.

---

## 9. Empty states

- **No pins**: large dashed area with `Drop photos, paste a link, or hit V to start a board`. No prefab pins.
- **No lists**: centered card — `Plan your first shoot. Start blank, or pick a template.` + primary `New shot list`.
- **No templates**: centered card — `Save any shot list as a template to reuse it.` Empty grid (just the dashed New-template card).

Per the user's preference, **no pre-built starter templates ship in v1** — the templates gallery starts empty.

---

## 10. Keyboard

| Key | Context | Action |
|---|---|---|
| `V` | any vlog page | Open New-pin modal pre-focused on URL input |
| `N` | any vlog page | Open New-list modal (Inspiration tab) / New-shot inline (List tab) / New-template modal (Templates tab) |
| `/` | Inspiration | Focus search |
| `1` `2` `3` | any vlog page | Switch tabs (Inspiration / Lists / Templates) |
| `Space` | List view, focused row | Toggle shot done |
| `Enter` | List view, focused row | Open shot detail modal |
| `↑` / `↓` | List view | Move row focus |
| `⌘/Ctrl + Enter` | any modal | Submit |
| `Esc` | any modal | Cancel |

---

## 11. Accessibility

- All `Check` toggles are real `<button>` elements with `aria-label="Mark {shot title} as done"` / `... as not done`.
- `PinCard` is a `<button>` (or `<a>` for link pins, with `target="_blank" rel="noopener"`).
- Masonry grid keyboard nav: arrow keys move focus by spatial nearest-neighbor; `Enter` opens lightbox.
- All four shot-list view styles must reach 4.5:1 contrast for body text. The done-state line-through must not be the *only* affordance — paired with opacity reduction + muted color.
- Drag-and-drop reorder must have a keyboard alternative (arrow keys with a "move mode" toggled by `Space` after focusing the drag handle).

---

## 12. Telemetry

Emit one event per user action:
- `vlog_pin.created` (kind), `vlog_pin.archived`, `vlog_pin.reordered`
- `vlog_list.created`, `vlog_list.viewed`, `vlog_list.style_changed` (style)
- `vlog_shot.toggled`, `vlog_shot.created`, `vlog_shot.removed`
- `vlog_template.created`, `vlog_template.instantiated`, `vlog_template.deleted`
- `vlog.tab_changed` (tab)

Each event includes `{ route }` plus the relevant entity ID.

---

## 13. Implementation notes for Cursor

- Drop a `vlog/` folder next to `habits/` in the existing routes/pages directory. Sub-routes: `inspiration.tsx`, `lists.tsx`, `lists/[id].tsx`, `templates.tsx`, plus a `components/` subfolder for `PinCard`, `ShotListSummary`, the four list-view variants, and `TemplateCard`.
- Re-use the existing prime sidebar — add the Vlog nav item to its config (don't fork the sidebar).
- Re-use existing button, card, tab-pill, segmented, tag, kbd components — DO NOT rewrite them.
- Reuse the existing `Check` component verbatim (same one used in Habits).
- All tokens already exist as CSS custom properties — don't redefine.
- Don't add any reference to `Project`, `projectId`, or "Linked project" — the two domains are isolated, same rule as Habits.
- The masonry algorithm should be a pure JS distribution (greedy fit by shortest column), not CSS columns — CSS columns break drag-reorder. The mock uses this approach.

---

## 14. Open questions for the user

1. Pin storage: confirm CDN choice (S3 + CloudFront, matches projects?) and max upload size (suggest 50 MB / 60 sec for video pins in v1).
2. OG fetcher: build in-house or use a service (linkpreview, microlink)? Prefer in-house for privacy + rate-limit control.
3. Shot duration: free numeric input + unit suffix, or a discrete picker (5s / 10s / 15s / 30s / 1m / custom)?
4. Should completed shot lists auto-archive after N days, or stay until user archives?
5. Per-list view style: persist on the `ShotList` record (per-list), or as a single user preference (global default)? Mock currently shows per-list as the data model.
6. Templates: should `Edit template` be destructive (overwrite) or versioned (keep history)? v1 default = destructive overwrite, no versioning.
