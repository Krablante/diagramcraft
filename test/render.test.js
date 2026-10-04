import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../src/index.js";
import { listThemes } from "../src/themes.js";

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
