// Immutable revisions and export records. No watchers, database or process locks.
// @ts-check
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpec } from "./spec.js";
import { LibraryError, resolveConfig } from "./config.js";

export { LibraryError, resolveConfig } from "./config.js";

/** @typedef {import('./config.js').LibraryOptions} LibraryOptions */
/** @typedef {{id:string, revision:number, name:string, description:string, tags:string[], project:string, createdAt:string, updatedAt:string, change:string, origin?:{sessionID?:string,messageID?:string}}} Diagram */
/** @typedef {{id?:string, expectedRevision?:number, name?:string, description?:string, tags?:string[], project?:string, change?:string, origin?:{sessionID?:string,messageID?:string}}} SaveOptions */
/** @typedef {{revision?:number, theme?:string|object, formats?:Array<'svg'|'png'|'ascii'>, scale?:number, transparent?:boolean, charset?:'unicode'|'ascii', systemFonts?:boolean}} ExportOptions */

/** @param {string} file */
async function json(file) { return JSON.parse(await readFile(file, "utf8")); }
/** @param {string} file @param {unknown} value */
async function writeJson(file, value) { await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" }); }
/** @param {string} directory */
async function entries(directory) {
  try { return await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
/** @param {string} id */
function validID(id) {
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(id)) throw new LibraryError("Invalid diagram ID; use the ID returned by save/list");
  return id;
}
/** @param {string} root */
async function revisionNumbers(root) {
  return (await entries(join(root, "revisions"))).filter((e) => e.isDirectory() && /^[1-9]\d*$/.test(e.name)).map((e) => Number(e.name));
}
/** @param {string} root @param {number} [revision] */
async function metadata(root, revision) {
  const selected = revision ?? (await revisionNumbers(root)).reduce((latest, n) => Math.max(latest, n), 0);
  if (!Number.isSafeInteger(selected) || selected < 1) throw new LibraryError("Diagram or revision not found", "NOT_FOUND");
  try { return /** @type {Diagram} */ (await json(join(root, "revisions", String(selected), "metadata.json"))); }
  catch (error) { if (error.code === "ENOENT") throw new LibraryError("Diagram or revision not found", "NOT_FOUND"); throw error; }
}

/** Create a library handle. Resolving configuration does not create directories.
 * @param {LibraryOptions} [options] @param {string} [directory]
 */
export function createLibrary(options = {}, directory = process.cwd()) {
  const config = resolveConfig(options, directory);
  /** @param {string} id */
  const root = (id) => join(config.libraryDir, "diagrams", validID(id));

  /** Save validated JSON. Existing diagrams require an exact expectedRevision.
   * @param {object|string} input @param {SaveOptions} [settings]
   */
  async function save(input, settings = {}) {
    const spec = parseSpec(typeof input === "string" ? JSON.parse(input) : input);
    const id = settings.id ? validID(settings.id) : randomUUID();
    const target = root(id);
    const previous = settings.id ? await metadata(target) : undefined;
    if (previous && settings.expectedRevision !== previous.revision) throw new LibraryError(`Revision conflict: expected ${settings.expectedRevision ?? "(missing)"}, current ${previous.revision}. Read the diagram again before saving.`, "CONFLICT");
    if (!previous && settings.expectedRevision !== undefined) throw new LibraryError("expectedRevision is only valid when updating an existing diagram");
    for (const key of ["name", "description", "project", "change"]) {
      if (settings[key] !== undefined && typeof settings[key] !== "string") throw new LibraryError(`${key} must be a string`);
    }
    if (settings.name !== undefined && !settings.name.trim()) throw new LibraryError("name must not be empty");
    if (settings.tags !== undefined && (!Array.isArray(settings.tags) || settings.tags.some((t) => typeof t !== "string" || !t.trim()))) throw new LibraryError("tags must be an array of nonempty strings");
    const now = new Date().toISOString();
    /** @type {Diagram} */
    const record = {
      id, revision: (previous?.revision ?? 0) + 1,
      name: settings.name ?? previous?.name ?? spec.title ?? "Untitled diagram",
      description: settings.description ?? previous?.description ?? "",
      tags: settings.tags ?? previous?.tags ?? [], project: settings.project ?? previous?.project ?? "",
      createdAt: previous?.createdAt ?? now, updatedAt: now, change: settings.change ?? "",
      ...(settings.origin ? { origin: settings.origin } : {}),
    };
    const revisions = join(target, "revisions");
    await mkdir(revisions, { recursive: true });
    const pending = join(revisions, `.pending-${randomUUID()}`);
    await mkdir(pending);
    try {
      await writeJson(join(pending, "spec.json"), spec);
      await writeJson(join(pending, "metadata.json"), record);
      // Both writers target the same nonempty directory. Exactly one rename wins;
      // readers see either a complete old revision or a complete new revision.
      await rename(pending, join(revisions, String(record.revision)));
    } catch (error) {
      if (["EEXIST", "ENOTEMPTY"].includes(error.code)) throw new LibraryError("Revision conflict: another session saved first. Read the diagram again.", "CONFLICT");
      throw error;
    } finally { await rm(pending, { recursive: true, force: true }); }
    return record;
  }

  /** @param {string} id @param {number} [revision] */
  async function get(id, revision) {
    const record = await metadata(root(id), revision);
    const specPath = join(root(id), "revisions", String(record.revision), "spec.json");
    return { ...record, spec: await json(specPath), specPath };
  }

  /** Search metadata only, never load historical specs or rendered files.
   * @param {{query?:string, project?:string, limit?:number, offset?:number}} [filter]
   */
  async function list(filter = {}) {
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 || !Number.isSafeInteger(offset) || offset < 0) throw new LibraryError("limit must be 1..200 and offset a nonnegative integer");
    const query = (filter.query ?? "").toLocaleLowerCase();
    /** @type {Diagram[]} */
    const found = [];
    // Sequential metadata reads avoid unbounded file descriptors for large catalogs.
    for (const entry of await entries(join(config.libraryDir, "diagrams"))) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      let record;
      try { record = await metadata(root(entry.name)); }
      catch (error) { if (error instanceof LibraryError && error.code === "NOT_FOUND") continue; throw error; }
      if (filter.project !== undefined && record.project !== filter.project) continue;
      if (query && ![record.id, record.name, record.description, ...record.tags, record.project].join("\n").toLocaleLowerCase().includes(query)) continue;
      found.push(record);
    }
    found.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    return { diagrams: found.slice(offset, offset + limit), total: found.length, nextOffset: offset + limit < found.length ? offset + limit : null };
  }

  /** @param {string} id @param {{limit?:number, offset?:number}} [filter] */
  async function history(id, filter = {}) {
    await metadata(root(id));
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 || !Number.isSafeInteger(offset) || offset < 0) throw new LibraryError("limit must be 1..200 and offset a nonnegative integer");
    const numbers = (await revisionNumbers(root(id))).sort((a, b) => b - a);
    const revisions = [];
    for (const n of numbers.slice(offset, offset + limit)) revisions.push(await metadata(root(id), n));
    const exportEntries = (await entries(join(root(id), "exports"))).filter((e) => e.isDirectory() && !e.name.startsWith(".")).sort((a, b) => b.name.localeCompare(a.name));
    const exports = [];
    for (const e of exportEntries.slice(offset, offset + limit)) exports.push(await json(join(root(id), "exports", e.name, "export.json")));
    return { revisions, exports, revisionCount: numbers.length, exportCount: exportEntries.length,
      nextOffset: offset + limit < Math.max(numbers.length, exportEntries.length) ? offset + limit : null };
  }

  /** Export a pinned revision. Render outside the commit path; failed exports
   * never appear in history. Each export includes spec and resolved theme.
   * @param {string} id @param {ExportOptions} [settings]
   */
  async function exportDiagram(id, settings = {}) {
    const diagram = await get(id, settings.revision);
    const formats = settings.formats ?? ["svg", "png", "ascii"];
    if (!Array.isArray(formats) || !formats.length || formats.some((f) => !["svg", "png", "ascii"].includes(f))) throw new LibraryError("formats must contain svg, png and/or ascii");
    if (settings.scale !== undefined && (!Number.isFinite(settings.scale) || settings.scale <= 0)) throw new LibraryError("scale must be a positive number");
    if (settings.charset !== undefined && !["unicode", "ascii"].includes(settings.charset)) throw new LibraryError("charset must be unicode or ascii");
    for (const key of ["transparent", "systemFonts"]) if (settings[key] !== undefined && typeof settings[key] !== "boolean") throw new LibraryError(`${key} must be a boolean`);
    const { render } = await import("./index.js");
    const { revision, ...renderOptions } = settings;
    const requestedTheme = settings.theme ?? diagram.spec.theme;
    const theme = typeof requestedTheme === "string" && (requestedTheme.endsWith(".json") || /[\\/]/.test(requestedTheme)) ? resolve(directory, requestedTheme) : requestedTheme;
    const result = await render(diagram.spec, { ...renderOptions, theme, formats: [...new Set(formats)] });
    const exportID = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
    const parent = join(config.exportDir, id);
    const outputDir = join(parent, exportID);
    const pending = join(parent, `.pending-${exportID}`);
    await mkdir(pending, { recursive: true });
    const files = {};
    const hashes = {};
    const extensions = { svg: "svg", png: "png", ascii: "txt" };
    let committed = false;
    const catalogPending = join(root(id), "exports", `.pending-${exportID}`);
    try {
      for (const format of new Set(formats)) {
        const filename = `diagram.${extensions[format]}`;
        const data = format === "svg" ? result.svg : format === "png" ? result.png : result.ascii;
        await writeFile(join(pending, filename), data, { flag: "wx" });
        files[format] = join(outputDir, filename);
        hashes[format] = createHash("sha256").update(data).digest("hex");
      }
      await writeJson(join(pending, "spec.json"), result.spec);
      await writeJson(join(pending, "theme.json"), result.theme);
      const pkg = await json(fileURLToPath(new URL("../package.json", import.meta.url)));
      const record = { id: exportID, diagramID: id, revision: diagram.revision, createdAt: new Date().toISOString(), dorpieVersion: pkg.version,
        options: { theme: result.theme.id, formats: [...new Set(formats)], scale: settings.scale ?? result.spec.output.scale ?? 2,
          transparent: settings.transparent ?? result.spec.output.transparent ?? false, charset: settings.charset ?? result.spec.output.charset ?? "unicode", systemFonts: settings.systemFonts ?? false },
        files, hashes, outputDir };
      await writeJson(join(pending, "export.json"), record);
      await rename(pending, outputDir);
      await mkdir(catalogPending, { recursive: true });
      await writeJson(join(catalogPending, "export.json"), record);
      await rename(catalogPending, join(root(id), "exports", exportID));
      committed = true;
      return record;
    } finally {
      await Promise.all([pending, catalogPending, ...(committed ? [] : [outputDir])].map((path) =>
        rm(path, { recursive: true, force: true }).catch((error) => { if (error.code !== "ENOTDIR") throw error; })));
    }
  }

  return { config, save, get, list, history, export: exportDiagram };
}
