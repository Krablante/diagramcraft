# Themes and custom themes

A theme is a JSON token set: fonts, colours, node paints, strokes, shadows, edge styles, zone styling, background treatment and spacing defaults. The renderer implements a fixed vocabulary of primitives; themes compose them. That is why themes can look genuinely different without touching code.

Every built-in theme merges over `themes/_base.json`, which holds all defaults. A custom theme only needs to override what it changes.

```sh
dorpie themes                 # list ids and descriptions
dorpie themes paper > my-theme.json
dorpie render spec.json --theme my-theme.json
```

Per-spec tweaks use `style`, which is deep-merged over the resolved theme:

```json
{
  "theme": "classic",
  "style": {
    "node": { "radius": 14, "shadow": null },
    "edge": { "stroke": { "color": "#7c3aed" } },
    "fonts": { "title": { "family": "JetBrains Mono" } }
  }
}
```

## Built-in themes

| Id | Intent |
| --- | --- |
| `classic` | neutral flowcharts; white canvas, crisp lines, blue accent |
| `paper` | warm printed page; serif type, ink lines, grain and vignette |
| `glass` | liquid glass; colour fields, frosted translucent cards, highlights |
| `midnight` | dark navy canvas, soft glows and cyan accents |
| `vivid` | colour-coded shapes on white, strong indigo accent |
| `blueprint` | engineering drawing; grid paper, monospace, thin technical lines |
| `mono` | black-and-white print; monospace, square corners, zero colour |

## Token reference

### `canvas`

| Token | Meaning |
| --- | --- |
| `background` | Paint for the canvas. |
| `blobs` | Array of soft colour fields: `{ cx, cy, r, color, opacity }`, coordinates `0..1`. `null` to disable. |
| `texture` | `noise`, `grid` or `dots` overlay, `null` to disable. |
| `vignette` | `{ color, opacity, size }` edge darkening, `null` to disable. |
| `padding` | Distance from content to the canvas edge. |
| `minWidth` | Minimum content width before padding. |
| `radius` | Canvas corner radius. `0` for square corners. |

Paint objects:

```jsonc
{ "type": "solid", "color": "#ffffff" }
{ "type": "linear", "angle": 120, "stops": [[0, "#e8e9ff"], [1, "#ffe9f2"]] }  // angle: 0 = left→right, 90 = top→bottom
{ "type": "radial", "center": [0.5, 0.4], "radius": 0.8, "stops": [[0, "#fff"], [1, "#00000000"]] }
```

Textures:

```jsonc
{ "type": "noise", "opacity": 0.05, "scale": 1, "seed": 7 }
{ "type": "grid",  "color": "rgba(125,211,252,0.12)", "size": 22, "width": 1 }
{ "type": "dots",  "color": "rgba(148,163,184,0.12)", "size": 26, "radius": 1 }
```

### `fonts`

One token per role: `title`, `subtitle`, `node`, `note`, `edge`, `zone`, `footer`.

| Token | Meaning |
| --- | --- |
| `family` | Font family. |
| `size` | Font size in pixels. |
| `weight` | Numeric weight (400, 500, 600, 700). |
| `color` | Fill colour. |
| `lineHeight` | Line height multiplier, default `1.35`. |
| `spacing` | Letter spacing in pixels. |
| `uppercase` | `zone` only: render the label in uppercase. |

Bundled families: **Inter** (400/500/600), **Source Serif 4** (400/600), **JetBrains Mono** (400/700). Requesting another weight selects the nearest bundled one. PNG output uses these files directly, so rasterised text is identical on every host. SVG output references the family name; viewers without the font fall back to a system font, which is normal for SVG.

To add a font for a fork: drop the TTF into `assets/fonts/`, add it to the `known` map in `scripts/build-metrics.mjs`, run `npm run metrics`, and reference it from a theme.

### `node`

| Token | Meaning |
| --- | --- |
| `minWidth` | Minimum node width. |
| `maxTextWidth` | Wrap labels beyond this width. |
| `padX`, `padY` | Inner padding. |
| `radius` | Corner radius for boxes. |
| `fill` | Paint for normal nodes. |
| `stroke` | `{ color, width, dash }`; `dash` is an array like `[5, 4]` or `null`. |
| `shadow` | `{ color, opacity, blur, y }` or `null`. |
| `glow` | `{ color, blur }` or `null`; adds a soft halo. |
| `shine` | Paint overlay for glass-style highlights, or `null`. |
| `kinds.<kind>` | Per-kind overrides: any of the tokens above, plus `size` for `connector` and `junction`. |
| `accent` | `{ fill, stroke, text: { color } }` used by `accent: true` nodes. |

### `edge`

| Token | Meaning |
| --- | --- |
| `stroke` | `{ color, width, dash }`. |
| `cornerRadius` | Corner rounding of orthogonal routes. `0` for hard corners. |
| `arrow` | `{ type: "triangle" \| "vee" \| "circle" \| "none", size, color }`; `color: null` follows the line. |
| `label` | `{ fill, padX, padY, radius }` for the label pill; `fill: "none"` draws bare text. |
| `kinds.dashed` / `kinds.dotted` | Dash pattern overrides. |

### `zone`

| Token | Meaning |
| --- | --- |
| `fill` | Zone background paint. |
| `stroke` | `{ color, width, dash }`. |
| `radius` | Corner radius. |
| `pad` | Horizontal padding around member nodes (also the minimum label gutter). |
| `padY` | Vertical padding; keep it small so adjacent zones do not collide. |
| `labelPad` | Label inset. |
| `labelColor` | Label colour override; `null` uses `fonts.zone.color`. |

### `heading`, `footer`, `layout`

| Token | Meaning |
| --- | --- |
| `heading.align` | `left`, `center` or `right`. |
| `heading.gap` | Gap between the heading block and the diagram. |
| `heading.rule` | `{ color, width, length, gap }` accent rule under the title, or `null`. |
| `heading.subtitleGap` | Gap between title and subtitle. |
| `footer.gap`, `footer.align` | Footer spacing and alignment. |
| `layout.nodeGap` | Space between nodes in the same layer. |
| `layout.rankGap` | Space between layers. |
| `layout.edgeGap` | Space between edges and nodes. |
| `layout.edgeLabelGap` | Space reserved around edge labels. |

## Writing a theme

A minimal custom theme — everything else comes from the built-in base:

```json
{
  "id": "terminal",
  "title": "Terminal",
  "description": "Green on black, monospace",
  "tags": ["dark", "monospace"],
  "order": 20,
  "canvas": {
    "background": { "type": "solid", "color": "#0b0f0c" },
    "texture": { "type": "grid", "color": "rgba(74,222,128,0.08)", "size": 24 }
  },
  "fonts": {
    "title": { "family": "JetBrains Mono", "size": 24, "weight": 700, "color": "#bbf7d0" },
    "node": { "family": "JetBrains Mono", "size": 13, "weight": 400, "color": "#d1fae5" },
    "edge": { "family": "JetBrains Mono", "size": 10.5, "weight": 400, "color": "#4ade80" }
  },
  "node": {
    "radius": 4,
    "fill": { "type": "solid", "color": "#052e16" },
    "stroke": { "color": "#22c55e", "width": 1.3 },
    "shadow": null
  },
  "edge": {
    "stroke": { "color": "#22c55e", "width": 1.4 },
    "arrow": { "type": "vee", "size": 10, "color": "#4ade80" }
  }
}
```

Rules of thumb for a cohesive theme:

- Give the theme one typographic voice (one family, at most one accent family).
- Derive fill, stroke and background from the same hue family; use the accent sparingly.
- Change the arrowhead and corner radius too, not just colours.
- Check the theme on a diagram with a decision, a note and a group; that is where weak themes fall apart.
- Run `npm run gallery` in the repository to refresh the README images after theme changes.
