# Contributing

Thanks for taking a look. The project is small on purpose; the fastest way in is:

```sh
npm install
npm run check
npm run gallery          # renders the README images
node bin/dorpie.js render examples/quickstart.json --format svg,png,ascii
```

## Where things go

- Spec shape and validation: `src/spec.js` (+ `schema/diagram.schema.json`).
- Rendering: `src/svg.js`, `src/ascii.js`, `src/layout.js`.
- Themes: JSON files in `themes/` merging over `themes/_base.json`.
- Examples: `examples/`, used by tests and docs.
- Docs: `README.md`, `docs/`, `AGENTS.md`.

## Adding a theme

1. `dorpie themes classic > themes/your-theme.json` (or copy any theme).
2. Set a unique `id`, `title`, `description`, `tags` and `order`.
3. Change typography, shapes, line work, background and accent — a theme should read as a different visual system, not a recolour.
4. Render a diagram with a decision, a note, a group and an accent node; inspect the PNG.
5. Add the theme to the tests implicitly (they cover all built-ins) and run `npm run check && npm run gallery`.

## Code style

- Plain ESM JavaScript with JSDoc types; `npm run typecheck` must stay clean.
- Keep responsibilities inside the file boundaries listed in `AGENTS.md`.
- No new runtime dependencies without a clear reason; the two current ones (layout engine, SVG rasteriser) are load-bearing.
- No build step, no generated source files.

## Pull requests

Keep the change focused; include what changed and how it was verified (commands and a short visual note for renderer/theme changes). Update `CHANGELOG.md` for user-visible changes.
