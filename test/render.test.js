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
  assert.ok(themes.length >= 8, "expected at least eight built-in themes");
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

test("retired theme ids resolve to the replacement themes", async () => {
  for (const [retired, replacement] of [["glass", "light"], ["midnight", "dark"]]) {
    assert.equal(getTheme(retired), getTheme(replacement));
    const old = await render(spec, { theme: retired, formats: ["svg"] });
    const current = await render(spec, { theme: replacement, formats: ["svg"] });
    assert.equal(old.svg, current.svg);
    assert.equal(old.theme.id, replacement);
  }
});

test("accent nodes use readable secondary text and support an override", async () => {
  const spec = { nodes: [{ id: "accent", label: "Release", note: "Version and checksums", accent: true }] };
  for (const { id } of listThemes()) {
    const result = await render(spec, { theme: id, formats: ["svg"] });
    assert.ok(result.svg.includes(`fill="${result.theme.node.accent.text.color}" text-anchor="middle" dominant-baseline="central">Version and checksums</text>`), id);
  }
  const custom = await render({ ...spec, style: { node: { accent: { note: { color: "#fedcba" } } } } });
  assert.match(custom.svg, /fill="#fedcba"[^>]*>Version and checksums<\/text>/);
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
  assert.ok(groupedResult.svg.includes("Repeated × N"));
  const labelPosition = groupedResult.svg.indexOf(">Repeated × N</text>");
  assert.ok(labelPosition > groupedResult.svg.lastIndexOf("marker-end="), "group labels paint above crossing routes");
  assert.ok(labelPosition < groupedResult.svg.indexOf('data-node="tokens"'), "group labels stay below nodes");
});

test("multiline decision labels and notes fit inside the diamond", async () => {
  for (const { id } of listThemes()) {
    const result = await render({ nodes: [{ id: "decision", kind: "decision", label: "Все изменения согласованы?", note: "Дополнительная строка\nи пояснение" }] }, { theme: id });
    const node = result.model.nodes[0];
    const noteFont = result.theme.fonts.note;
    const labelHeight = node.lines.length * node.labelFont.size * (node.labelFont.lineHeight ?? 1.35);
    const noteHeight = node.noteLines.length * noteFont.size * (noteFont.lineHeight ?? 1.35);
    let cursor = -(labelHeight + 5 + noteHeight) / 2;
    for (const [lines, font] of [[node.lines, node.labelFont], [node.noteLines, noteFont]]) {
      if (lines === node.noteLines) cursor += 5;
      const lineHeight = font.size * (font.lineHeight ?? 1.35);
      for (const line of lines) {
        const y = Math.abs(cursor + lineHeight / 2) + lineHeight / 2;
        assert.ok(measureText(line, font) / node.w + 2 * y / node.h < 1, `${id}: ${line} crosses the diamond`);
        cursor += lineHeight;
      }
    }
  }
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
