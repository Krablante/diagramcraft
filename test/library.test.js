import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createLibrary, LibraryError } from "../src/library.js";
import { resolveConfig } from "../src/config.js";
import { installPlugin } from "../src/plugin-install.js";
import plugin from "../src/opencode-plugin.js";

const spec = { title: "Deploy flow", nodes: [{ id: "a", label: "Сборка" }, { id: "b", label: "Deploy" }], edges: [{ from: "a", to: "b" }] };
/** @param {import('node:test').TestContext} t */
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "dorpie-library-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const configFile = join(dir, "config.json");
  await writeFile(configFile, "{}");
  const options = { libraryDir: join(dir, "library"), exportDir: join(dir, "artifacts"), configFile };
  return { dir, options, library: createLibrary(options) };
}

test("persistent source revisions, search, metadata, paging and version conflicts", async (t) => {
  const { library, options } = await fixture(t);
  const first = await library.save(spec, { description: "Shipping to production", tags: ["release"], project: "/project" });
  assert.equal(first.revision, 1);
  const reopened = createLibrary(options);
  assert.equal((await reopened.get(first.id)).spec.nodes[0].label, "Сборка");
  await assert.rejects(reopened.save(spec, { id: first.id }), (e) => e instanceof LibraryError && e.code === "CONFLICT");
  const second = await reopened.save({ ...spec, title: "Changed" }, { id: first.id, expectedRevision: 1, name: "New name", change: "Add retry" });
  assert.equal(second.revision, 2);
  assert.equal(second.project, "/project");
  assert.equal((await reopened.get(first.id, 1)).name, "Deploy flow");
  assert.equal((await reopened.list({ query: "production", project: "/project" })).total, 1);
  assert.equal((await reopened.list({ query: "RELEASE" })).total, 1);
  assert.equal((await reopened.list({ project: "/different" })).total, 0);
  const history = await reopened.history(first.id, { limit: 1 });
  assert.equal(history.revisions[0].revision, 2);
  assert.equal(history.nextOffset, 1);
  await assert.rejects(reopened.get("../../outside"), LibraryError);
  await assert.rejects(reopened.get(first.id, 999), (e) => e instanceof LibraryError && e.code === "NOT_FOUND");
  await assert.rejects(reopened.list({ limit: 0 }), LibraryError);
});

test("concurrent writers cannot overwrite the same source revision", async (t) => {
  const { library, options, dir } = await fixture(t);
  const first = await library.save(spec);
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => createLibrary(options).save(spec, { id: first.id, expectedRevision: 1, name: `writer-${i}` })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(results.filter((r) => r.status === "rejected").every((r) => r.reason.code === "CONFLICT"));
  assert.equal((await library.get(first.id)).revision, 2);
  assert.ok((await readdir(join(dir, "library", "diagrams", first.id, "revisions"))).every((name) => !name.startsWith(".pending")));
});

test("exports keep exact source, resolved theme, options, hashes and previous files", async (t) => {
  const { library, options, dir } = await fixture(t);
  const first = await library.save(spec);
  const a = await library.export(first.id, { formats: ["svg", "png", "ascii"], theme: "glass" });
  assert.equal(a.options.scale, 2);
  assert.equal(a.options.transparent, false);
  assert.equal((await readFile(a.files.png)).subarray(1, 4).toString(), "PNG");
  const bytes = await readFile(a.files.svg);
  assert.equal((JSON.parse(await readFile(join(a.outputDir, "theme.json"), "utf8"))).id, "glass");
  await library.save(spec, { id: first.id, expectedRevision: 1, name: "Version 2" });
  const moved = createLibrary({ ...options, exportDir: join(dir, "different-exports") });
  const b = await moved.export(first.id, { revision: 1, formats: ["svg"], theme: "paper" });
  assert.equal(b.revision, 1);
  assert.notEqual(a.id, b.id);
  assert.deepEqual(await readFile(a.files.svg), bytes);
  assert.equal((await moved.history(first.id)).exportCount, 2);
  await assert.rejects(library.export(first.id, { formats: [] }), LibraryError);
  await assert.rejects(library.export(first.id, { theme: "missing-theme" }));
  assert.equal((await library.history(first.id)).exportCount, 2);
});

test("config precedence, relative paths and invalid explicit config", async (t) => {
  const { dir, options } = await fixture(t);
  await writeFile(options.configFile, JSON.stringify({ libraryDir: "saved", exportDir: "output" }));
  assert.equal(resolveConfig({ configFile: options.configFile }).libraryDir, join(dir, "saved"));
  assert.equal(resolveConfig({ configFile: options.configFile, libraryDir: "override" }, dir).libraryDir, join(dir, "override"));
  assert.throws(() => resolveConfig({ configFile: join(dir, "missing") }), LibraryError);
  await writeFile(options.configFile, '{"unknown":true}');
  assert.throws(() => resolveConfig({ configFile: options.configFile }), LibraryError);
});

test("export catalog write failure rolls back files and preserves source", async (t) => {
  const { library, dir } = await fixture(t);
  const saved = await library.save(spec);
  const blocked = join(dir, "library", "diagrams", saved.id, "exports");
  await writeFile(blocked, "not a directory");
  await assert.rejects(library.export(saved.id, { formats: ["svg"] }));
  assert.equal((await library.get(saved.id)).revision, 1);
  assert.deepEqual(await readdir(join(dir, "artifacts", saved.id)), []);
  await rm(blocked);
  assert.equal((await library.history(saved.id)).exportCount, 0);
});

test("CLI and plugin share saved work; plugin writes respect edit permissions and return PNG", async (t) => {
  const { dir, options, library } = await fixture(t);
  const hooks = await plugin.server({ directory: dir, worktree: "/project" }, options);
  const context = { directory: dir, worktree: "/project", sessionID: "s1", messageID: "m1", ask: async () => {} };
  await assert.rejects(hooks.tool.dorpie_save.execute({ spec }, { ...context, ask: async () => { throw new Error("denied"); } }), /denied/);
  assert.equal((await library.list()).total, 0);
  const saved = JSON.parse((await hooks.tool.dorpie_save.execute({ spec, name: "From plugin" }, context)).output);
  const cli = spawnSync(process.execPath, [fileURLToPath(new URL("../bin/dorpie.js", import.meta.url)), "get", saved.id, "--spec", "--config", options.configFile, "--library-dir", options.libraryDir], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).nodes[0].label, "Сборка");
  const exported = await hooks.tool.dorpie_export.execute({ id: saved.id, formats: ["png"] }, context);
  assert.match(exported.attachments[0].url, /^data:image\/png;base64,/);
  const newSession = await plugin.server({ directory: dir }, options);
  assert.equal(JSON.parse((await newSession.tool.dorpie_list.execute({ query: "From plugin" })).output).total, 1);
  const schema = JSON.parse((await hooks.tool.dorpie_help.execute({ topic: "schema" })).output);
  assert.ok(schema.properties.nodes);
});

test("plugin install is idempotent, preserves user files and loads from another profile", async (t) => {
  const { dir } = await fixture(t);
  const configDir = join(dir, "profile");
  const first = await installPlugin({ configDir });
  assert.equal(first.restartRequired, true);
  const loaded = await import(pathToFileURL(first.plugin).href);
  assert.equal(loaded.default.id, "dorpie");
  assert.deepEqual(await installPlugin({ configDir }), first);
  await writeFile(first.plugin, "// user plugin\n");
  await assert.rejects(installPlugin({ configDir }), /unmanaged/);
  await assert.rejects(installPlugin({ app: "unknown" }), LibraryError);
});
