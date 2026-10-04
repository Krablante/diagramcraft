import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, "..", "bin", "diagramcraft.js");
const example = join(here, "..", "examples", "quickstart.json");

const run = (args) => spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });

test("render writes requested formats", () => {
  const dir = mkdtempSync(join(tmpdir(), "diagramcraft-"));
  try {
    const result = run(["render", example, "--format", "svg,ascii", "--out", `${dir}/`]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(dir, "quickstart.svg")));
    assert.ok(existsSync(join(dir, "quickstart.txt")));
    assert.ok(!existsSync(join(dir, "quickstart.png")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("render to stdout keeps stdout clean", () => {
  const result = run(["render", example, "--format", "ascii", "--out", "-", "--quiet"]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.startsWith("From spec to diagram"));
});

test("validate reports structured results", () => {
  const result = run(["validate", example, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.theme, "classic");
});

test("validate exits 2 with readable issues", () => {
  const dir = mkdtempSync(join(tmpdir(), "diagramcraft-"));
  try {
    const file = join(dir, "bad.json");
    writeFileSync(file, JSON.stringify({ nodes: [{ id: "a" }], edges: [{ from: "a", to: "ghost" }] }));
    const result = run(["validate", file]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /edges\[0\]\.to/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("themes lists built-ins and prints one theme", () => {
  const listed = run(["themes", "--json"]);
  assert.equal(listed.status, 0, listed.stderr);
  const themes = JSON.parse(listed.stdout);
  assert.ok(themes.some((theme) => theme.id === "glass"));

  const one = run(["themes", "paper"]);
  assert.equal(one.status, 0, one.stderr);
  const theme = JSON.parse(one.stdout);
  assert.equal(theme.id, "paper");
  assert.equal(theme.fonts.title.family, "Source Serif 4");
});

test("init writes a starter spec", () => {
  const dir = mkdtempSync(join(tmpdir(), "diagramcraft-"));
  try {
    const file = join(dir, "diagram.json");
    const result = run(["init", file]);
    assert.equal(result.status, 0, result.stderr);
    const spec = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(spec.theme, "paper");
    assert.ok(spec.nodes.length >= 4);

    const again = run(["init", file]);
    assert.equal(again.status, 2, "second init should refuse to overwrite");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("version and help work", () => {
  assert.match(run(["--version"]).stdout, /^\d+\.\d+\.\d+/);
  assert.match(run(["--help"]).stdout, /diagramcraft render/);
  assert.equal(run(["nonsense"]).status, 2);
});

test("programmatic API is importable from the package root", () => {
  const script = `import { render, listThemes } from ${JSON.stringify(join(here, "..", "src", "index.js"))};
const result = await render({ nodes: [{ id: "a", label: "A" }] }, { formats: ["svg", "ascii"] });
console.log(listThemes().length, result.svg.length > 100, result.ascii.includes("A"));`;
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
  assert.equal(out.trim().split(" ").slice(0, 3).join(" "), "7 true true");
});
