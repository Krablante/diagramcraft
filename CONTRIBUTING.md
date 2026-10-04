# Contributing

[English](./CONTRIBUTING.md) · [Русский](./CONTRIBUTING.ru.md) · [Home](./README.md)

Thanks for taking a look. The project is small on purpose: a plain ESM package with no build step and a documented spec. The renderer uses ELK and resvg; the plugin uses Zod for tool arguments. The fastest way in is:

```sh
git clone https://github.com/Krablante/dorpie
cd dorpie
npm ci
npm run check
node bin/dorpie.js render examples/quickstart.json --format svg,png,ascii --out /tmp/dorpie-preview/
```

Node 20 or newer is required; CI runs the checks on Node 20, 22 and 24.

## Repository commands

| Command | What it does |
| --- | --- |
| `npm test` | Runs the `node:test` suite (spec validation, rendering, CLI smoke tests). |
| `npm run typecheck` | Runs `tsc --noEmit` with `checkJs` over the JSDoc types. |
| `npm run check` | Typecheck followed by tests; this is the gate for a change. |
| `npm run metrics` | Regenerates `assets/fonts/metrics.json` after font changes. |
| `npm run gallery` | Renders `docs/gallery` images from `examples/`; run after visual changes. |

## How it fits together

The pipeline is deliberately linear:

```
spec JSON → validation + theme → pixel layout (ELK) → SVG → PNG (resvg)
                              → cell layout (ELK)  → ASCII
CLI / plugin → library → immutable revisions + preserved exports → renderer
```

| File | Responsibility |
| --- | --- |
| `src/spec.js` | Parse and validate the JSON spec; the only place that defines its shape. |
| `src/themes.js` | Load built-in themes and theme files, merge overrides. |
| `src/text.js` | Text measurement and wrapping against bundled font metrics. |
| `src/layout.js` | Spec + theme to geometry via ELK; zones and normalization. |
| `src/shapes.js` | Shared shape outlines and border geometry for drawing and edge snapping. |
| `src/svg.js` | Geometry to SVG; the only place that knows how tokens become paint. |
| `src/ascii.js` | Spec to an ASCII/Unicode grid through a separate cell layout. |
| `src/png.js` | SVG to PNG with resvg and the bundled fonts. |
| `src/index.js` | Public API (`render`, `parseSpec`, theme helpers). |
| `src/cli.js` | Argument parsing, file IO and exit codes only. |
| `src/library.js`, `src/config.js` | Immutable saved revisions, export history and shared settings. |
| `src/opencode-plugin.js`, `src/plugin-install.js` | Agent tools and a config-preserving plugin installer. |

Invariants to preserve:

- **The spec is the only editable source.** Generated SVG/PNG/ASCII are outputs; nothing must require editing them.
- **Themes are data.** Built-in themes live in `themes/*.json` and merge over `themes/_base.json`. Do not add theme-specific branches to the renderer; add tokens or primitives instead.
- **No build step, no hidden runtime.** Plain ESM with renderer dependencies `elkjs`, `@resvg/resvg-js` and plugin argument schemas from `zod`. Do not add a bundler or transpiler.
- **Deterministic output.** The same spec and theme must produce byte-identical SVG. Bundled fonts stay in `assets/fonts/` with their OFL licenses and are regenerated via `npm run metrics`.
- **PNG is local.** No browser, no network, no system fonts by default.
- **ASCII and SVG use separate layouts** (character cell space vs pixels); both render from the same spec with the same layout engine.

## Making changes

- **Spec or validation:** update `src/spec.js`, `schema/diagram.schema.json`, `docs/spec.md` and `docs/spec.ru.md`, and the tests in `test/spec.test.js`. The published schema and the validator must agree.
- **Renderer, layout or theme:** render an example in the affected themes and inspect the PNG (composition, labels, overlaps, contrast). Run `npm run gallery` and commit the refreshed images. Update `docs/themes.md` and `docs/themes.ru.md` for token changes.
- **CLI:** update `src/cli.js`, its `HELP` text and `docs/cli.md` + `docs/cli.ru.md`, and keep `test/cli.test.js` covering the command.
- **Library/plugin:** keep shared behavior in `src/library.js`; plugin and CLI are adapters. `test/library.test.js` covers persistence, conflicts, exports, permissions and installation. Update `docs/library*` and `docs/plugin*` together. Keep immutable source revisions separate from derived exports.
- **Examples:** `examples/` doubles as documentation and test fixtures; keep every file valid and representative. `scripts/gallery.mjs` renders them into `docs/gallery`.
- **Documentation:** update the affected pages in every supported language; see the convention below.

## Documentation

English uses the base filename (`README.md`, `docs/cli.md`); translations insert a language code before `.md` (`README.ru.md`, `docs/cli.ru.md`). English and Russian are the current languages. Add Ukrainian as `.uk.md`, German as `.de.md`, or another language the same way. Add its link to every page's language switcher and keep links inside that translation pointing to translated pages. The package allowlist includes new language files automatically.

Keep the same categories and heading order in every language, with natural wording in each. Update meaning together when behavior changes. Shared examples, schemas and gallery images stay in one place. Installation starts in the README; CLI details belong in `docs/cli`, storage and configuration in `docs/library`, plugin setup in `docs/plugin`, spec/theme/API references in their own pages, agent usage in `docs/agents`, and development and release procedures here. Link to the owner of a topic instead of repeating its full reference.

## Adding a theme

1. `dorpie themes classic > themes/your-theme.json` (or copy any theme).
2. Set a unique `id` and a `title`; `description`, `tags` and `order` are optional metadata.
3. Change typography, shapes, line work, background and accent — a theme should read as a different visual system, not a recolour.
4. Render a diagram with a decision, a note, a group and an accent node; inspect the PNG.
5. `npm run check && npm run gallery`; the gallery script includes every built-in theme automatically.
6. Add the new preview to the README theme table (both languages) and to the theme list in `docs/themes.md` + `docs/themes.ru.md`.

## Pull requests

Keep the change focused; include what changed and how it was verified (commands and a short visual note for renderer/theme changes). Update `CHANGELOG.md` and `CHANGELOG.ru.md` for user-visible changes.

## Releases

1. Run `npm version X.Y.Z --no-git-tag-version` to update `package.json` and the lockfile. Update all changelog translations.
2. Update versioned install URLs in the READMEs and agent, plugin and API guides in every language.
3. `npm run check`, `npm pack --dry-run`, then install the packed tarball in a scratch prefix and render an example.
4. `npm run gallery`, commit, tag `vX.Y.Z`, push.
5. Create the GitHub release with notes and attach the tarball produced by `npm pack` plus `SHA256SUMS` (`sha256sum dorpie-X.Y.Z.tgz > SHA256SUMS`). Keep packaging artifacts outside the checkout. Install that exact artifact wherever a deployed runtime is maintained, then verify the CLI and reload the consuming backend.
6. `npm publish --access public` only with a valid npm token; publishing is not currently configured, so the GitHub release is the distribution channel.
