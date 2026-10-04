# Spec reference

A diagram is one JSON object. It is the only file you edit: SVG, PNG and ASCII are always rendered from it. `dorpie schema` prints the machine-readable JSON Schema.

```jsonc
{
  "version": 1,
  "title": "Deploy flow",
  "subtitle": "From merge to production",
  "footer": "team runbook",
  "theme": "paper",
  "direction": "TB",
  "layout": { "nodeGap": 42, "rankGap": 68, "edgeGap": 16 },
  "output": { "formats": ["svg", "png", "ascii"], "scale": 2 },
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
  ],
  "groups": [
    { "label": "CI", "nodes": ["build", "ok"] }
  ]
}
```

## Top level

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `version` | `1` | `1` | Spec version. |
| `title` | string | — | Rendered above the diagram. |
| `subtitle` | string | — | Second line under the title. |
| `footer` | string | — | Small line at the bottom of the canvas. |
| `theme` | string | `classic` | Built-in theme id, or a path ending in `.json` for a custom theme. |
| `direction` | `TB` \| `LR` \| `RL` \| `BT` | `TB` | Flow direction. Use `LR` for pipelines and timelines. |
| `layout` | object | theme | Spacing overrides: `nodeGap`, `rankGap`, `edgeGap` (pixels). |
| `style` | object | — | Deep overrides merged over the resolved theme; see [themes.md](./themes.md). |
| `output` | object | — | Defaults for formats, PNG `scale`, `transparent`, ASCII `charset`. CLI flags win. |
| `nodes` | array | required | At least one node. |
| `edges` | array | `[]` | Connections between nodes. |
| `groups` | array | `[]` | Visual zones around groups of nodes. |

## Nodes

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `id` | string | required | Unique id used by edges and groups. |
| `label` | string | `id` | Text in the node. `\n` starts a new line; long labels wrap automatically. |
| `kind` | node kind | `process` | Shape and semantics, see below. |
| `note` | string | — | Small muted line under the label. |
| `accent` | boolean | `false` | Fill the node with the theme accent colour. |
| `color` | string | — | Solid fill override for this node. |
| `maxWidth` | number | theme | Wrap the label at this width in pixels. |
| `width`, `height` | number | auto | Fixed size; rarely needed. |

### Node kinds

| Kind | Shape | Use for |
| --- | --- | --- |
| `terminal` | stadium / rounded ends | start, end, entry points |
| `process` | rounded rectangle | actions, steps, modules |
| `decision` | diamond | yes/no and other branches |
| `data` | parallelogram | inputs, outputs, data |
| `document` | rectangle with a wavy bottom | documents, reports, files |
| `database` | cylinder | stores, databases, caches |
| `connector` | circle | on-page connectors, merge points with a letter |
| `note` | page with a folded corner | annotations and warnings |
| `junction` | small dot | silent merges (no label), e.g. residual adds |

## Edges

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `id` | string | `e0`, `e1`, … | Optional id. |
| `from`, `to` | string | required | Node ids. Self-loops are not supported; use a junction or a retry path. |
| `label` | string | — | Short text placed next to the edge. Keep it to `yes`/`no`/`retry`. |
| `kind` | `solid` \| `dashed` \| `dotted` | `solid` | Line style. |
| `arrow` | `end` \| `both` \| `none` | `end` | Arrowheads. Arrows into junction dots are suppressed. |
| `color` | string | theme | Line and arrow colour override. |

Edges are routed automatically as orthogonal lines with rounded corners. Parallel edges, cycles and long feedback loops are supported; the layout engine reserves space for labels.

## Groups

A group is a visual zone drawn behind its member nodes. It does not influence layout — place nodes so the flow makes sense, then draw a zone around a phase, a subsystem or a repeated block.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `id` | string | `g0`, … | Optional id. |
| `label` | string | `id` | Rendered in the left gutter of the zone. |
| `nodes` | string[] | required | Member node ids; a node may belong to one group. |
| `color` | string | theme | Zone fill override. |

## Output defaults

`output.formats` lets a spec decide what `dorpie render spec.json` produces:

```json
{ "output": { "formats": ["svg", "ascii"], "charset": "ascii", "transparent": true } }
```

## Style overrides

`style` is merged deep over the chosen theme, so you can adjust a few tokens without writing a whole theme:

```json
{
  "theme": "vivid",
  "style": {
    "fonts": { "title": { "size": 32 } },
    "node": {
      "radius": 16,
      "shadow": null,
      "accent": { "fill": { "type": "solid", "color": "#0f766e" } }
    },
    "edge": { "stroke": { "color": "#0f172a", "width": 1.8 } }
  }
}
```

Arrays (like gradient stops) are replaced, not merged.

## Validation

`dorpie validate` reports every problem at once with a JSON path, for example:

```
spec error: 3 problems
  nodes[1].id: duplicate node id "build" (first used by nodes[0])
  edges[2].to: unknown node "shiping"
  output.formats: unknown format "jpeg"; expected svg, png or ascii
```

Exit codes: `0` success, `2` invalid spec or arguments, `1` runtime failure. Use `--json` for machine-readable validation output.

## Readability tips

- Keep labels short and specific; put detail in `note`.
- One idea per node. Split long chains.
- Use `decision` only for real branching; use edge labels `yes`/`no`.
- Use `LR` direction for pipelines, `TB` for procedures.
- Use groups for phases (`Prepare`, `Publish`, `Roll out`), not for decoration.
- 10–20 nodes per diagram is the sweet spot; beyond that, split or group.
