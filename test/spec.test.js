import test from "node:test";
import assert from "node:assert/strict";
import { parseSpec, SpecError } from "../src/spec.js";
import { readFileSync } from "node:fs";
import { z } from "zod";

const minimal = {
  nodes: [{ id: "a", label: "A" }, { id: "b", kind: "decision", label: "B" }],
  edges: [{ from: "a", to: "b" }],
};

test("normalizes a minimal spec", () => {
  const spec = parseSpec(minimal);
  assert.equal(spec.version, 1);
  assert.equal(spec.theme, "classic");
  assert.equal(spec.direction, "TB");
  assert.equal(spec.nodes[0].kind, "process");
  assert.equal(spec.nodes[0].label, "A");
  assert.equal(spec.edges[0].kind, "solid");
  assert.equal(spec.edges[0].arrow, "end");
});

test("parseSpec is idempotent on its own output", () => {
  const once = parseSpec(minimal);
  const twice = parseSpec(once);
  assert.deepEqual(twice, once);
});

test("collects every problem with paths", () => {
  let error;
  try {
    parseSpec({
      bogus: true,
      theme: 42,
      direction: "sideways",
      layout: { nope: 1 },
      nodes: [
        { id: "a", kind: "nope", lable: "typo" },
        { id: "a", label: "dupe" },
        {},
        { id: "c", accent: "yes" },
      ],
      edges: [{ from: "a", to: "ghost", colour: "red" }, { from: "a", to: "a" }],
      groups: [{ nodes: ["a", "missing"] }],
      output: { formats: ["svg", "gif"], transparent: "yes" },
    });
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof SpecError);
  const paths = error.issues.map((issue) => issue.path);
  for (const expected of [
    "bogus",
    "theme",
    "direction",
    "layout.nope",
    "nodes[0].kind",
    "nodes[0].lable",
    "nodes[1].id",
    "nodes[2].id",
    "nodes[3].accent",
    "edges[0].to",
    "edges[0].colour",
    "edges[1]",
    "groups[0].nodes[1]",
    "output.formats",
    "output.transparent",
  ]) {
    assert.ok(paths.includes(expected), `expected issue for ${expected}, got ${paths.join(", ")}`);
  }
});

test("rejects labels on junction nodes and self-loops", () => {
  assert.throws(() => parseSpec({ nodes: [{ id: "j", kind: "junction", label: "x" }] }), SpecError);
  assert.throws(() => parseSpec({ nodes: [{ id: "a" }], edges: [{ from: "a", to: "a" }] }), SpecError);
});

test("keeps output overrides", () => {
  const spec = parseSpec({ ...minimal, output: { formats: ["png", "ascii"], scale: 3, transparent: true, charset: "ascii" } });
  assert.deepEqual(spec.output, { formats: ["png", "ascii"], scale: 3, transparent: true, charset: "ascii" });
});

test("published schema accepts editable normalized revisions and matches field types", () => {
  const schema = z.fromJSONSchema(JSON.parse(readFileSync(new URL("../schema/diagram.schema.json", import.meta.url), "utf8")));
  for (const raw of [minimal, { ...minimal, direction: "lr" }, { ...minimal, title: null, style: null, output: null }]) {
    assert.ok(schema.safeParse(raw).success);
    assert.ok(schema.safeParse(parseSpec(raw)).success);
  }
  for (const raw of [
    { ...minimal, direction: ["TB"] },
    { ...minimal, nodes: [{ id: "a", kind: ["process"] }] },
    { ...minimal, nodes: [{ id: "a", accent: null }] },
    { ...minimal, output: { transparent: null } },
    { ...minimal, output: { scale: -1 } },
    { ...minimal, nodes: [{ id: "a", width: 0 }] },
  ]) {
    assert.equal(schema.safeParse(raw).success, false);
    assert.throws(() => parseSpec(raw), SpecError);
  }
});
