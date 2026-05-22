# Whiteboard — integration package

A hand-drawn, infinite-canvas whiteboard component (rough.js + React). Built as plain `.jsx` files transpiled in-browser with Babel for the demo, but the source compiles cleanly to a standard React app or a feature module inside an existing one.

## Files

```
whiteboard/
├── whiteboard-canvas.jsx     Canvas + drawing/selection/text engine (~700 lines)
├── whiteboard-toolbar.jsx    Toolbar, properties panel, swatches, library, zoom, history
├── whiteboard-app.jsx        Composition root: state, history, palettes, bg-picker
├── tweaks-panel.jsx          Optional dev-time tweaks panel (safe to drop)
├── whiteboard.css            All styles (incl. @font-face for Excalifont)
├── fonts/Excalifont-Regular.ttf
└── demo.html                 Standalone demo — open this in a browser
```

## External dependencies

- **react** + **react-dom** (18.3.x — works on 18 and 19)
- **roughjs** (4.6.x) — `rough.svg(svgEl)` is the only API used

```bash
npm install react react-dom roughjs
```

## Integration into a Cursor / Vite / Next project

### 1. Drop in the source

Copy `whiteboard-canvas.jsx`, `whiteboard-toolbar.jsx`, `whiteboard-app.jsx`, `tweaks-panel.jsx` into e.g. `src/whiteboard/`. Copy `whiteboard.css` and `fonts/` alongside (or under `public/`).

### 2. Replace the Babel/global wiring

The demo uses `<script type="text/babel">` and stashes components on `window.*`. For a bundled build, replace:

```js
// at the bottom of whiteboard-canvas.jsx
window.WBCanvas = forwardRef(Canvas);
window.WBHelpers = { ... };
```

with named ESM exports:

```js
export const WBCanvas = forwardRef(Canvas);
export { newSeed, newId, bboxOf, hitTest, STROKE_PALETTE, FILL_PALETTE };
```

Do the same for `whiteboard-toolbar.jsx` (`Toolbar`, `PropsPanel`, `Library`, `ZoomControls`, `HistoryControls`, `BrandChip`, `ActionsBar`, `GhostCursors`, `Hint`, `TIcon`) and `whiteboard-app.jsx` (`App`).

Then in `whiteboard-app.jsx` replace the top-of-file `const { WBToolbar, ... } = window;` block with normal imports:

```js
import { WBCanvas } from './whiteboard-canvas';
import { Toolbar as WBToolbar, PropsPanel as WBPropsPanel, /* ... */ } from './whiteboard-toolbar';
```

### 3. Add the font + CSS

In your app entry:

```js
import './whiteboard/whiteboard.css';
```

Make sure the `@font-face` URL in `whiteboard.css` points at where the TTF actually serves from. Two options:

- **Vite/Next public dir**: copy `fonts/Excalifont-Regular.ttf` to `public/fonts/` and the existing `url('fonts/Excalifont-Regular.ttf')` works as-is.
- **Bundle the font**: change the URL to `url('./fonts/Excalifont-Regular.ttf')` so the bundler fingerprints it.

### 4. Render

```jsx
import { App as Whiteboard } from './whiteboard/whiteboard-app';

export default function Page() {
  return <Whiteboard />;
}
```

The component fills its container — give the parent a fixed height (or `100vh`).

## Persistence hooks

The integrated app persists whiteboard preferences to `localStorage` with board-scoped keys:

| Key | Value |
|---|---|
| `wb-stroke-palette` | JSON array of stroke hex strings (account-scoped) |
| `wb-board-${boardKey}-fill-palette` | JSON array (`'transparent'` allowed) |
| `wb-board-${boardKey}-bg-color` | Hex string for the board background |
| `wb-board-${boardKey}-view` | JSON object: `{ x: number, y: number, scale: number }` |

`boardKey` resolves to the persisted board row id when available (falls back to `boardId`).

Default stroke behavior now follows board background selection:
- Light backgrounds default stroke to `#1e1e1e`.
- The dark preset background (`#1e1e1e`) defaults stroke to `#ffffff`.

Element data is **not** persisted yet. To add persistence, hook into `setElements` in `whiteboard-app.jsx` (search for `useState(() => makeStarterElements())`) and serialize/deserialize against your backend. Each element is a plain JSON-safe object with this shape:

```ts
type Element = {
  id: string;
  type: 'rectangle' | 'ellipse' | 'diamond' | 'line' | 'arrow' | 'freedraw' | 'text';
  x: number; y: number; w: number; h: number;
  stroke: string;
  fill?: string;             // 'transparent' or hex
  fillStyle?: 'hachure' | 'cross-hatch' | 'solid';
  strokeWidth?: number;
  roughness?: number;        // 0 (architect) — 2 (cartoonist)
  edge?: 'sharp' | 'round';
  seed: number;              // stable rough.js seed — keep this constant per element
  // freedraw only:
  points?: [number, number][];
  // text only:
  text?: string;
  fontSize?: number;
  textAlign?: 'left' | 'center' | 'right';
  manualWidth?: number;      // if set, text wraps at this width
};
```

## Multi-board support

The current package treats `localStorage` as a single board. For a multi-board app, namespace the keys with a `boardId`:

```js
const k = (suffix) => `wb-${boardId}-${suffix}`;
localStorage.getItem(k('bg-color'));
```

Pass `boardId` into the App component and thread it through the three `useState` initializers in `whiteboard-app.jsx`.

## Theming

CSS variables driving the look (defined in `goals-styles.css` originally — see `whiteboard.css` for the overrides):

| Variable | Purpose |
|---|---|
| `--wb-canvas` | Board background (`r g b` triplet) |
| `--wb-grid` | Grid dot color |
| `--wb-selection` | Selection outline / handles |
| `--accent` | Active swatches, primary buttons |
| `--surface`, `--fg`, `--border`, `--muted` | Panel chrome |

You'll want to either copy the `:root` block from your project's tokens or remap the variables in `whiteboard.css`.

## Known integration gotchas

1. **`rough.svg()`** must be called once per `<svg>`. The canvas does this in a `useEffect` keyed on the SVG ref — fine on its own, but if you mount/unmount the whiteboard, make sure the ref settles first.
2. **`<foreignObject>`** is used to render text so wrap + alignment match the textarea. If you ship to environments that strip `foreignObject` (some SVG sanitizers), swap to `<text>` with `text-anchor` (lossy: no wrapping).
3. **`onWheel`** uses `passive: false` semantics via `preventDefault`. React 17+ delegates wheel to root; in some embeds you may need to attach the listener with `{ passive: false }` directly to the SVG ref.
4. **Babel inline transform** in `demo.html` is dev-only. Don't ship it.

## Demo

Open `demo.html` in a browser. No build step — it loads React + Babel + roughjs from a CDN.
