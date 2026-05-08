# Cursor prompt — integrate this whiteboard

Paste the prompt below into Cursor with this folder attached.

---

I'm adding the whiteboard module in `whiteboard/` to my app. Please integrate it as follows:

1. Move the four `.jsx` files into `src/whiteboard/` (keep `.jsx` extension if my project uses JSX, otherwise rename to `.tsx`).
2. Replace the `window.WB*` global assignments at the bottom of each file with named ESM exports. Replace the `const { WBToolbar, ... } = window` block at the top of `whiteboard-app.jsx` with `import` statements.
3. Move `whiteboard.css` to `src/whiteboard/whiteboard.css` and import it from the app entry. Move `fonts/Excalifont-Regular.ttf` to `public/fonts/` (or update the @font-face URL to be bundled).
4. Add a route or page that renders `<Whiteboard />` (the renamed `App` from `whiteboard-app.jsx`), inside a container that's at least `100vh` tall.
5. If my project has a TypeScript config, generate a `whiteboard.d.ts` from the `Element` shape in `README.md`.
6. Wire element persistence to my backend — replace the `useState(() => makeStarterElements())` initializer with a hook that loads from `/api/boards/:id` and debounces saves on every `setElements` call.
7. Namespace the three `localStorage` keys (`wb-stroke-palette`, `wb-fill-palette`, `wb-bg-color`) with the current `boardId`.
8. Verify `roughjs` is installed (`pnpm add roughjs`), confirm React is on 18.3+ or 19.

After integration, smoke-test: drag a rectangle, double-click empty space to add text, alt-click a swatch to remove it. Report any console errors.
