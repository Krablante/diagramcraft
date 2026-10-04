# Themes and custom themes

[English](./themes.md) · [Русский](./themes.ru.md) · [Home](../README.md)

A theme is a JSON token set: fonts, colours, node paints, strokes, shadows, edge styles, zone styling, background treatment and spacing defaults. The renderer implements a fixed vocabulary of primitives, and themes compose them. Themes can look different without touching code.

Every built-in theme merges over [`themes/_base.json`](../themes/_base.json), which holds all defaults. A custom theme only needs to override what it changes, but it must define a non-empty `id` and `title`. `dorpie themes classic` prints a full resolved theme if you want to see every token at once.

```sh
dorpie themes                 # list ids and descriptions
dorpie themes paper > my-theme.json
dorpie render spec.json --theme my-theme.json
```

A theme value ending in `.json` or containing `/` is treated as a file path and loaded from disk. Relative paths are resolved against the current working directory, not the spec file.

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

Arrays (like gradient stops) are replaced, not merged.

## Built-in themes

| Id | Intent |
| --- | --- |
| `classic` | neutral flowcharts; white canvas, crisp lines, blue accent |
| `mono` | black-and-white print; monospace, square corners, zero colour |
| `light` | soft grey canvas, white nodes and restrained blue; light documents and slides |
| `dark` | charcoal surfaces, clear outlines and pale blue; dark documents and slides |
| `paper` | ivory paper grain, serif labels, warm ink and shallow relief; editorial diagrams |
| `vivid` | muted fills by node kind, dark labels and a teal accent; colour-coded flowcharts |
| `blueprint` | fine blue grid, opaque shapes, monospace labels and open arrows; technical drawings |
| `copper` | charcoal grain, copper highlights and raised surfaces; warm presentation diagrams |

Classic, Mono, Light, Dark and Vivid use flat fills without filters. Paper and Copper use fine grain and small shadows; Blueprint keeps a low-contrast grid outside the shapes. All use bundled fonts and run locally.

`glass` and `midnight` are compatibility ids for `light` and `dark`, omitted from listings. `getTheme` and new exports return the replacement theme id. Saved source revisions keep their original spec; existing exports keep their files and resolved theme snapshots. To reproduce an older appearance, pass its archived `theme.json` as a custom theme file.

`dorpie themes --json` also returns `description`, `tags`, `title` and `order` for each theme. Metadata never affects rendering except `order`, which sorts the listings.

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

Bundled families: **Inter** (400/500/600), **Source Serif 4** (400/600), **JetBrains Mono** (400/700). Requesting another weight selects the nearest bundled one. Bundled metrics cover Latin, Greek, Cyrillic, common punctuation and arrows, so labels in those scripts measure and wrap correctly.

PNG output rasterises text from the bundled TTF files, so it does not depend on system fonts. SVG output references the family name; a viewer without that font falls back to a system font, which is normal for SVG. If a theme uses a family Dorpie does not bundle, `--system-fonts` lets the PNG renderer look for it on the host, at the cost of host-dependent output.

To add a font for a fork: drop the TTF into `assets/fonts/`, add it to the `known` map in `scripts/build-metrics.mjs`, run `npm run metrics`, and reference it from a theme.

### `node`

| Token | Meaning |
| --- | --- |
| `minWidth` | Minimum content width; horizontal padding is added around it. |
| `maxTextWidth` | Wrap labels beyond this width. |
| `padX`, `padY` | Inner padding. |
| `radius` | Corner radius for boxes. |
| `fill` | Paint for normal nodes. |
| `stroke` | `{ color, width, dash }`; `dash` is an array like `[5, 4]` or `null`. |
| `shadow` | `{ color, opacity, blur, y }` or `null`. |
| `glow` | `{ color, blur }` or `null`; adds a soft halo. |
| `shine` | Paint overlay for glass-style highlights, or `null`. |
| `kinds.<kind>` | Per-kind `fill`, `stroke`, `shadow` and `glow`, plus `size` for `connector` and `junction`. |
| `accent` | `{ fill, stroke, text: { color }, note?: { color } }` used by `accent: true` nodes. Secondary text follows the accent text colour unless `note.color` overrides it. |

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
  "id": "sage",
  "title": "Sage",
  "description": "Light diagrams with a green accent",
  "tags": ["light"],
  "order": 20,
  "canvas": {
    "background": { "type": "solid", "color": "#f5f8f5" },
    "texture": { "type": "dots", "color": "rgba(70,109,89,0.07)", "size": 24, "radius": 1 }
  },
  "node": {
    "radius": 6,
    "stroke": { "color": "#466d59", "width": 1.4 },
    "accent": {
      "fill": { "type": "solid", "color": "#315847" },
      "stroke": { "color": "#315847", "width": 1.4 },
      "text": { "color": "#ffffff" }
    }
  },
  "edge": {
    "stroke": { "color": "#466d59", "width": 1.4 },
    "label": { "fill": "#f5f8f5" }
  }
}
```

Save it as `sage.json` and render with `--theme sage.json`. Only `id` and `title` are required; `description`, `tags` and `order` are listing metadata with sensible defaults.

For a dark custom theme, start with `dorpie themes dark > my-theme.json`. Change all text roles and per-kind fills together; a dark canvas with inherited white shapes is not enough. Keep the texture away from labels, use shadows sparingly, and check every shape with `examples/node-shapes.json` plus groups and accent notes with `examples/theme-preview.json`.

Rules of thumb for a cohesive theme:

- Give the theme one typographic voice (one family, at most one accent family).
- Derive fill, stroke and background from the same hue family; use the accent sparingly.
- Change the arrowhead and corner radius too, not just colours.
- Check the theme on a diagram with a decision, a note and a group; that is where weak themes fall apart.
- Run `npm run gallery` in the repository to refresh the README images after theme changes.
