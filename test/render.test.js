import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, SpecError, ThemeError } from "../src/index.js";
import { listThemes } from "../src/themes.js";
import { wrapText, measureText } from "../src/text.js";
import { deepMerge } from "../src/util.js";
import { borderAt } from "../src/shapes.js";
import { getTheme } from "../src/themes.js";

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(here, "..", "examples", "quickstart.json"), "utf8"));

test("renders every built-in theme", async () => {
  const themes = listThemes();
  assert.ok(themes.length >= 7, "expected at least seven built-in themes");
  for (const theme of themes) {
    const result = await render(spec, { theme: theme.id, formats: ["svg", "ascii"] });
    assert.ok(result.svg.startsWith("<svg"), `${theme.id}: svg output`);
    assert.ok(result.svg.includes("Write the JSON spec"), `${theme.id}: labels in svg`);
    assert.ok(result.ascii.includes("Write the JSON spec"), `${theme.id}: labels in ascii`);
    assert.equal(result.png, undefined);
  }
});

test("svg output is deterministic", async () => {
  const first = await render(spec, { theme: "paper", formats: ["svg"] });
  const second = await render(spec, { theme: "paper", formats: ["svg"] });
  assert.equal(first.svg, second.svg);
});

test("png rasterizes with bundled fonts", async () => {
  const result = await render(spec, { theme: "glass", formats: ["png"], scale: 1 });
  assert.ok(Buffer.isBuffer(result.png));
  assert.equal(result.png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.ok(result.png.length > 20_000, `unexpectedly small png: ${result.png.length} bytes`);
});

test("style overrides change the rendered theme", async () => {
  const styled = {
    ...spec,
    style: { canvas: { background: { type: "solid", color: "#101010" } }, fonts: { title: { color: "#00ff00" } } },
  };
  const result = await render(styled, { theme: "classic", formats: ["svg"] });
  assert.ok(result.svg.includes("#101010"));
  assert.ok(result.svg.includes("#00ff00"));
});

test("all node kinds and groups render", async () => {
  const shapes = JSON.parse(readFileSync(join(here, "..", "examples", "node-shapes.json"), "utf8"));
  const result = await render(shapes, { formats: ["svg", "ascii"] });
  for (const kind of ["terminal", "decision", "data", "document", "database", "connector", "note", "junction"]) {
    assert.ok(result.svg.includes(`data-node="${kind}"`), `svg is missing ${kind}`);
  }
  const grouped = JSON.parse(readFileSync(join(here, "..", "examples", "transformer-block.json"), "utf8"));
  const groupedResult = await render(grouped, { formats: ["svg"] });
  assert.ok(groupedResult.model.zones.length === 1);
  assert.ok(groupedResult.svg.includes("REPEATED × N"));
});

test("ascii charset can drop unicode frame characters", async () => {
  const result = await render(spec, { theme: "mono", formats: ["ascii"], charset: "ascii" });
  assert.ok(!/[╭╮╰╯─│▶]/.test(result.ascii));
  assert.ok(result.ascii.includes("|") || result.ascii.includes("+"));
});

test("connector labels, standalone subtitles and long words survive rendering", async () => {
  const result = await render({ subtitle: "Standalone subtitle", nodes: [{ id: "c", kind: "connector", label: "A" }, { id: "word", label: "abcdefghijklmnopqrstuvwxyz", maxWidth: 55 }], edges: [{ from: "c", to: "word" }] }, { formats: ["svg", "ascii"] });
  assert.match(result.svg, /Standalone subtitle/);
  assert.match(result.svg, />A<\/text>/);
  assert.ok(result.model.nodes.find((n) => n.id === "word").lines.length > 1);
  const font = result.theme.fonts.node;
  for (const spacing of [0, 2]) for (const line of wrapText("abcdefghijklmnopqrstuvwxyz word spaced", { ...font, spacing }, 55)) assert.ok(measureText(line, { ...font, spacing }) <= 55);
});

test("ASCII preserves user text and draws both arrowheads", async () => {
  const result = await render({ direction: "LR", nodes: [{ id: "a", label: "Сборка" }, { id: "b", label: "配置" }], edges: [{ from: "a", to: "b", arrow: "both" }] }, { formats: ["ascii"], charset: "ascii" });
  assert.match(result.ascii, /Сборка/);
  assert.match(result.ascii, /配置/);
  assert.match(result.ascii, /</);
  assert.match(result.ascii, />/);
});

test("SVG escapes colors and deep merging cannot change object prototypes", async () => {
  const color = '\"/><script>alert(1)</script><rect fill=\"';
  const result = await render({ nodes: [{ id: "a", color }], style: { fonts: { node: { color } } } });
  assert.ok(!result.svg.includes("<script>"));
  assert.match(result.svg, /&lt;script&gt;/);
  const merged = deepMerge({}, JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}'));
  assert.equal(Object.getPrototypeOf(merged), Object.prototype);
  assert.equal({}.polluted, undefined);
});

test("render rejects invalid options and unusable font/spacing tokens", async () => {
  for (const options of [{ formats: ["pdf"] }, { scale: 0 }, { charset: "wrong" }, { transparent: "yes" }]) await assert.rejects(render(spec, /** @type {any} */ (options)), SpecError);
  for (const style of [{ fonts: { node: { size: 0 } } }, { node: { maxTextWidth: -1 } }, { canvas: null }]) await assert.rejects(render({ ...spec, style }), ThemeError);
});

test("document waves and folded note corners expose their actual borders", () => {
  const rect = { x: 0, y: 0, w: 100, h: 100 };
  const theme = getTheme("classic");
  assert.ok(Math.abs(borderAt("document", rect, theme, "bottom", 50) - 92.5) < 0.001);
  assert.equal(borderAt("note", rect, theme, "right", 8), 92);
});
