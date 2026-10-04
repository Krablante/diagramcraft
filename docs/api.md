# Node API

[English](./api.md) · [Русский](./api.ru.md) · [Home](../README.md)

The library is Dorpie's primary interface; the CLI only adds argument parsing and file IO around it. The package is plain ESM, so use `import`:

```js
import { render } from "dorpie";
```

Install it from a release tarball or straight from the repository:

```sh
npm install https://github.com/Krablante/dorpie/releases/download/v0.4.0/dorpie-0.4.0.tgz
# or, tracking main:
npm install github:Krablante/dorpie
```

## render

```js
import { render } from "dorpie";

const { svg, png, ascii } = await render(spec, {
  theme: "paper",                 // built-in id, path to a theme file, or a resolved theme object
  formats: ["svg", "png", "ascii"],
  scale: 2,
  transparent: false,
  systemFonts: false,
  charset: "unicode",
});
```

`render(input, options)` accepts a spec object or a JSON string and returns a promise. It writes nothing to disk. For persistent diagrams, source revisions and exports, use `createLibrary` from `dorpie` or the lightweight `dorpie/library` entrypoint; see [library.md](./library.md).

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `theme` | string or object | spec `theme` | Built-in id, file path, or theme object with `id` and `title`; missing tokens use base defaults. |
| `formats` | array | spec `output.formats`, then `["svg"]` | Which outputs to produce; an empty array also falls back to the default. |
| `scale` | number | spec `output.scale`, then `2` | PNG scale multiplier. |
| `transparent` | boolean | spec `output.transparent`, then `false` | Drop the canvas background in SVG and PNG. |
| `systemFonts` | boolean | `false` | Allow system font fallback during PNG rasterisation. |
| `charset` | `unicode` or `ascii` | spec `output.charset`, then `unicode` | Character set for ASCII output. |

The result contains:

| Field | Type | Notes |
| --- | --- | --- |
| `spec` | Spec | The normalized spec, with defaults filled in. |
| `theme` | Theme | The resolved theme after `spec.style` overrides. |
| `model` | Model | Laid-out geometry: node positions and sizes, edge routes, zones and canvas bounds. |
| `svg` | string | Always produced, even when only PNG or ASCII was requested. |
| `png` | Buffer | Present when `formats` includes `png`. |
| `ascii` | string | Present when `formats` includes `ascii`. |

```js
import { render } from "dorpie";

const result = await render(
  {
    title: "Deploy flow",
    nodes: [
      { id: "start", kind: "terminal", label: "Push to main" },
      { id: "ship", kind: "terminal", label: "Ship it" },
    ],
    edges: [{ from: "start", to: "ship" }],
  },
  { theme: "paper", formats: ["svg", "png"], scale: 2 },
);

result.svg;  // string
result.png;  // Buffer
```

## parseSpec and SpecError

`parseSpec(raw)` validates and normalizes a spec object without rendering. It throws `SpecError` with an `issues` array; every issue has a JSON `path` and a human-readable `message`:

```js
import { parseSpec, SpecError } from "dorpie";

try {
  const spec = parseSpec(JSON.parse(text));
  // spec.nodes, spec.edges, spec.groups, spec.output, ...
} catch (error) {
  if (error instanceof SpecError) {
    for (const { path, message } of error.issues) {
      console.error(`${path}: ${message}`);
    }
  }
  throw error;
}
```

When a JSON string is passed straight to `render`, invalid JSON throws `SyntaxError` from `JSON.parse` before validation; use `parseSpec(JSON.parse(text))` if you want to handle both.

## Themes in code

```js
import { listThemes, getTheme, loadThemeFile, ThemeError } from "dorpie";

listThemes();
// [{ id, title, description, tags, order }, ...] sorted for display

const theme = getTheme("light");          // resolved built-in theme
const custom = loadThemeFile("./my-theme.json"); // resolved custom theme over the base defaults
```

`getTheme` returns a shared cached object: treat it as read-only, or clone it before changing tokens (`structuredClone(getTheme("paper"))`). `loadThemeFile` resolves relative paths against `process.cwd()`. Both throw `ThemeError` for an unknown id, a missing file, or invalid theme JSON.

For per-spec tweaks, prefer `spec.style` — it is deep-merged over the resolved theme and needs no theme file:

```js
await render({ ...spec, style: { fonts: { title: { color: "#4338ca" } } } });
```

## Lower-level exports

Most callers only need `render`, but the pipeline is public and can be driven one step at a time.

| Export | Signature | Purpose |
| --- | --- | --- |
| `parseSpec` | `(raw) => Spec` | Validate and normalize a spec; throws `SpecError`. |
| `layoutSpec` | `async (spec, theme, options?) => Model` | Compute geometry with the layered layout engine. |
| `renderSvg` | `(model, theme, spec, options?) => string` | Render geometry to SVG; `options.transparent` drops the background. |
| `renderAscii` | `async (spec, theme, options?) => string` | Render to a character grid; `options.charset` is `unicode` or `ascii`. |
| `svgToPng` | `(svg, options?) => Buffer` | Rasterise SVG; `options` are `scale`, `systemFonts`, `fontFiles`. |
| `bundledFontFiles` | `() => string[]` | Absolute paths of the bundled OFL fonts. |
| `listThemes`, `getTheme`, `loadThemeFile`, `ThemeError` | theme helpers | See above. |

```js
import { parseSpec, getTheme, layoutSpec, renderSvg, svgToPng } from "dorpie";

const spec = parseSpec(rawSpec);
const theme = getTheme("blueprint");
const model = await layoutSpec(spec, theme);
const svg = renderSvg(model, theme, spec, { transparent: true });
const png = svgToPng(svg, { scale: 3 });
```

`renderAscii` lays the diagram out again in character-cell space, so its model differs from the pixel model even though both come from the same spec.

## Side effects and determinism

`render` never writes files, never opens a browser and never makes network requests. The same spec and theme produce the same SVG string; PNG and ASCII are deterministic too, because PNG uses the bundled fonts instead of host fonts. Reading theme files, font metrics and bundled fonts is the only file access involved.

Options are validated before layout: unknown formats, nonpositive scale, an unknown charset and non-boolean switches throw `SpecError`. Theme loading checks the font sizes and core spacing needed by layout and throws `ThemeError` for unusable values.

PNG work grows with canvas area: doubling `scale` makes four times as many pixels, before shadows and textures add their cost. Prefer SVG for large diagrams and scale 1 for preview PNGs. `render` always produces pixel geometry and SVG; requesting ASCII adds another ELK layout and a character grid. For an ASCII-only embedding that needs no pixel result, call `renderAscii(parseSpec(raw), getTheme("mono"))` directly. Its output cost grows with the grid's bounding area, including empty cells.
