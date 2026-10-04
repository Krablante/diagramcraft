# Using Dorpie from an agent

[English](./agents.md) · [Русский](./agents.ru.md) · [Home](../README.md)

This page is written for AI agents and for people who configure them. Everything here works without a GUI, a browser or network access at render time.

## Setup

```sh
# global install from the release tarball
npm install -g https://github.com/Krablante/dorpie/releases/download/v0.2.1/dorpie-0.2.1.tgz

# or run straight from a checkout, no install
node /path/to/dorpie/bin/dorpie.js <command>

dorpie schema             # full JSON Schema of the spec
dorpie themes             # theme ids and descriptions
```

Example specs live in [`examples/`](../examples) in the repository and in the installed package's `examples/` directory.

## The loop

1. **Write or edit one JSON spec.** Keep it as the source of truth. If the user asks for a change, edit the spec — never the SVG, PNG or ASCII.
2. **Validate before rendering.**
   ```sh
   dorpie validate spec.json          # human-readable
   dorpie validate spec.json --json   # machine-readable
   ```
   Exit code `2` means the spec is invalid; every problem is reported with its JSON path.
3. **Render.** SVG is cheap, ASCII is cheapest, PNG is for the user.
   ```sh
   dorpie render spec.json --format svg,ascii --out out/
   dorpie render spec.json --format png --scale 2 --out out/diagram.png
   ```
4. **Look at the result.** For PNG, open it with a vision tool and check labels, arrows, overlaps and readability. For quick iterations, read the ASCII — it shows structure, branches and labels without rasterising.
5. **Fix the spec and render again.** Repeat until the diagram reads well; then deliver the requested files.

## System prompt snippet

```
You can create and edit diagrams with the dorpie CLI.
- A diagram is one JSON spec; it is the editable source. Never edit generated
  SVG/PNG/ASCII files; edit the spec and re-render.
- Check the spec shape with `dorpie schema` and validate with
  `dorpie validate <file>`. Fix every reported problem before rendering.
- Render with `dorpie render <file> --format svg,png,ascii`.
- Inspect the PNG yourself (vision) or the ASCII before claiming success.
- Choose a theme by intent: classic (neutral), paper (warm print), glass
  (modern, translucent), midnight (dark), vivid (colourful), blueprint
  (technical), mono (black-and-white print). List them with `dorpie themes`.
- Keep labels short; use `note` for detail; use edge labels yes/no on decisions;
  use groups for phases, not decoration.
```

## Choosing a theme

| Intent | Theme |
| --- | --- |
| documentation, reports, a calm print feel | `paper` |
| default flowcharts others will also edit | `classic` |
| product visuals, landing pages, modern decks | `glass` |
| dark slides or terminals | `midnight` |
| explainers with colour-coded stages | `vivid` |
| engineering, infrastructure, technical docs | `blueprint` |
| printing, photocopies, strict monochrome | `mono` |

## Writing specs that render well

- Keep node labels under ~24 characters; put the rest in `note`.
- 8–20 nodes per diagram. Split anything bigger into two diagrams or use groups.
- Ids are stable handles: keep them when editing so edges survive changes.
- Use `kind` deliberately: `terminal` for start/end, `decision` for real branching, `data` for inputs/outputs, `note` for caveats, `junction` for silent merges.
- Use `direction: "LR"` for pipelines and timelines, `TB` for procedures.
- Use groups for phases (`Prepare`, `Publish`, `Roll out`) and repeated blocks (`× N`). Groups do not move nodes; they are visual zones.
- Prefer spec-level `style` overrides for colour tweaks, and a theme file only when you need a reusable visual system.
- Unknown fields are rejected, and validation names them with a path — a typo fails fast instead of being ignored.

## Common mistakes

| Mistake | What you get |
| --- | --- |
| editing the SVG/PNG instead of the spec | the next render overwrites your change |
| duplicate node ids | `nodes[2].id: duplicate node id "build" (first used by nodes[1])` |
| edge pointing at a missing node | `edges[1].to: unknown node "shiping"` |
| self-loop | `edges[0]: self-loops are not supported; add a junction node instead` |
| label on a junction | `nodes[3].label: junction nodes do not render a label` |
| typo in a field name | `nodes[0].lable: unknown field "lable"` |
| long labels | nodes get wide and the layout gets tall; wrap with `\n` or shorten |
| treating groups as layout containers | nodes may sit outside a zone if the flow spreads; steer the flow with `direction` and node order instead |

## Programmatic use

```js
import { render, parseSpec, listThemes } from "dorpie";

const spec = parseSpec(JSON.parse(specText));   // throws SpecError with .issues
const { svg, png, ascii } = await render(spec, {
  formats: ["svg", "png", "ascii"],
  theme: "paper",          // built-in id or a path to a theme JSON file
  scale: 2,
});
```

`render` never writes files. The CLI only adds IO around it. The full surface — options, result fields, errors and lower-level exports — is in [api.md](./api.md).
