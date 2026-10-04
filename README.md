<h1 align="center">Dorpie</h1>

<p align="center"><strong>Write JSON. Get a diagram. Reopen it next session.</strong><br>
Seven visual themes · SVG, PNG and ASCII · CLI, Node API and OpenCode tools</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.ru.md">Русский</a>
</p>

<p align="center">
  <img alt="Transformer block diagram rendered in the Glass theme" src="./docs/gallery/transformer-block.png" width="560">
</p>

Dorpie is a CLI, Node library and OpenCode/OpenCodez plugin that renders a JSON diagram spec into SVG, PNG and ASCII. The spec is the source of truth: you describe nodes and edges once and render every format from them, so “add one more block” stays a two-line edit instead of a redraw. Saved diagrams keep source revisions and export history across agent sessions.

Everything runs locally in Node — no headless browser, no network calls while rendering, no accounts. Use it for a runbook, an architecture sketch, a release flow or a diagram an agent will revise later. Each theme sets typography, shapes, lines and background together.

## Install

Node 20 or newer. The package ships as a tarball attached to GitHub releases:

```sh
npm install -g https://github.com/Krablante/dorpie/releases/download/v0.3.1/dorpie-0.3.1.tgz
dorpie --version
```

You can also install straight from the repository, which tracks `main`:

```sh
npm install -g github:Krablante/dorpie
```

There is no npm registry release yet, so `npm install -g dorpie` does not work.

## Quickstart

To connect the installed package to OpenCodez, run `dorpie plugin install --app opencodez` and restart the backend. For upstream OpenCode, use `--app opencode`. No second package or service is needed. See [plugin setup and tools](./docs/plugin.md).

```sh
dorpie init hello.json      # writes a starter spec
dorpie render hello.json    # writes hello.svg, hello.png and hello.txt
```

`init` requests all three formats, so the render writes them next to the spec and prints their paths. Edit the JSON and render again:

```jsonc
{
  "version": 1,
  "title": "Deploy flow",
  "theme": "paper",
  "direction": "TB",
  "output": { "formats": ["svg", "png", "ascii"] },
  "nodes": [
    { "id": "start", "kind": "terminal", "label": "Push to main" },
    { "id": "build", "kind": "process", "label": "Build and test" },
    { "id": "ok", "kind": "decision", "label": "Green?" },
    { "id": "ship", "kind": "terminal", "label": "Ship it" }
  ],
  "edges": [
    { "from": "start", "to": "build" },
    { "from": "build", "to": "ok" },
    { "from": "ok", "to": "ship", "label": "yes" },
    { "from": "ok", "to": "build", "label": "no", "kind": "dashed" }
  ]
}
```

`dorpie validate spec.json` checks a spec without rendering and reports every problem with its JSON path. CLI flags override the spec: `dorpie render spec.json --theme glass --format png --scale 2 --out out/`. The full command reference is in [docs/cli.md](./docs/cli.md).

For work you want to reopen later, use `dorpie save spec.json --name "Deploy flow"`, then `dorpie export <returned-id>`. `dorpie list`, `get` and `history` find previous diagrams and their versions. CLI and plugin share one configurable library; exports keep their own files, source snapshot and theme. See [saved diagrams and configuration](./docs/library.md).

## Output formats

**SVG** is the primary output: fully vector, editable in any vector editor, small and sharp. **PNG** is rasterised locally with the bundled Open Font License fonts through resvg — no browser, no system fonts, no network. **ASCII** renders the same diagram on a character grid with Unicode box drawing; it reads well in a terminal and diffs cheaply, and `--charset ascii` falls back to `+`, `-` and `|`.

`--transparent` removes the canvas background for slides and docs, `--scale` sets the PNG multiplier (2 by default), and `--system-fonts` opts into system font fallback for PNG when a theme uses a family Dorpie does not bundle.

## Themes

Each theme is a complete system: fonts, line weights, node fills, arrowheads, backgrounds, textures and composition. Pick one by intent:

| | |
|---|---|
| ![Classic](./docs/gallery/theme-classic.png) **Classic** — neutral flowcharts, crisp and familiar | ![Mono](./docs/gallery/theme-mono.png) **Mono** — black-and-white print, monospace |
| ![Paper](./docs/gallery/theme-paper.png) **Paper** — warm printed page, serif, paper grain | ![Glass](./docs/gallery/theme-glass.png) **Glass** — liquid glass over colour fields |
| ![Midnight](./docs/gallery/theme-midnight.png) **Midnight** — dark navy, soft glows | ![Vivid](./docs/gallery/theme-vivid.png) **Vivid** — colour-coded shapes, indigo accent |
| ![Blueprint](./docs/gallery/theme-blueprint.png) **Blueprint** — engineering grid, technical lines | ![Node shapes](./docs/gallery/node-shapes.png) **Every shape** — terminal, decision, data, document, database, connector, note, junction |

Themes are data. Start from a built-in with `dorpie themes paper > my-theme.json`, change what you need, and render with `--theme my-theme.json`. Small tweaks can stay in the spec:

```json
{ "theme": "glass", "style": { "fonts": { "title": { "color": "#4338ca" } } } }
```

[docs/themes.md](./docs/themes.md) has the full token reference and a walkthrough for writing a theme.

## For AI agents

The whole product is built around one loop:

1. Write or edit the spec (JSON). Never edit the generated files.
2. `dorpie validate spec.json` — structured errors with paths.
3. `dorpie render spec.json --format svg,png,ascii`.
4. Look at the PNG (vision) or the ASCII, fix the spec, render again.

[docs/agents.md](./docs/agents.md) has a ready-to-paste system prompt, theme selection guidance and common mistakes. To call Dorpie from code instead of a shell, use the programmatic API:

```js
import { render } from "dorpie";

const { svg, png, ascii } = await render(spec, {
  theme: "glass",                 // built-in id or path to a theme JSON
  formats: ["svg", "png", "ascii"],
});
```

The full API reference is in [docs/api.md](./docs/api.md).

## Examples

- `examples/quickstart.json` — the smallest useful diagram
- `examples/buro-draft-workflow.json` — how a change lands in a revision-checked registry (Paper)
- `examples/opencodez-release.json` — release flow from upstream tag to verified hosts (Vivid, with zones)
- `examples/opencodebot-artifact.json` — how a file reaches a Telegram topic (Blueprint)
- `examples/transformer-block.json` — a residual transformer block with junction merges (Glass)
- `examples/node-shapes.json` — every node kind in one diagram

## Documentation

- [docs/cli.md](./docs/cli.md) — commands, options, exit codes, troubleshooting
- [docs/spec.md](./docs/spec.md) — every spec field, node kind and output default
- [docs/themes.md](./docs/themes.md) — theme tokens and how to write a theme
- [docs/api.md](./docs/api.md) — Node API for embedding Dorpie
- [docs/agents.md](./docs/agents.md) — the agent workflow and system prompt
- [docs/plugin.md](./docs/plugin.md) — OpenCode/OpenCodez installation and agent tools
- [docs/library.md](./docs/library.md) — saved diagrams, versions, exports and configuration
- [CONTRIBUTING.md](./CONTRIBUTING.md) — development setup, architecture and releases
- [CHANGELOG.md](./CHANGELOG.md) — release history

English pages use the base filename; translations add a language code, such as `cli.ru.md`. Each page links to the available languages. The same convention extends to any additional language; see [Contributing](./CONTRIBUTING.md#documentation).

## License

MIT. Bundled fonts (Inter, Source Serif 4, JetBrains Mono) are licensed under the SIL Open Font License; their licenses ship in `assets/fonts/LICENSES/`.
