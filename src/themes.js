// Theme loading: JSON token sets merged over an internal base theme.
// @ts-check
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deepMerge } from "./util.js";

/** @typedef {import("./types.js").Theme} Theme */

const here = dirname(fileURLToPath(import.meta.url));
const builtinDir = join(here, "..", "themes");

export class ThemeError extends Error {}

/** @type {Theme|null} */
let base = null;
/** @type {Map<string, Theme>|null} */
let builtins = null;

/** @param {string} path @returns {any} */
function loadJson(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new ThemeError(`cannot read theme file ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ThemeError(`invalid JSON in theme file ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function init() {
  if (builtins) return;
  base = deepMerge({}, loadJson(join(builtinDir, "_base.json")));
  builtins = new Map();
  for (const file of readdirSync(builtinDir).sort()) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;
    const raw = loadJson(join(builtinDir, file));
    const theme = mergeTheme(raw);
    builtins.set(theme.id, theme);
  }
  if (!builtins.size) throw new ThemeError(`no built-in themes found in ${builtinDir}`);
}

/**
 * Merge a raw theme document over the internal base defaults.
 * @param {any} raw
 * @returns {Theme}
 */
export function mergeTheme(raw) {
  init();
  if (!raw || typeof raw !== "object") throw new ThemeError("theme must be a JSON object");
  if (typeof raw.id !== "string" || !raw.id.trim()) throw new ThemeError("theme.id must be a non-empty string");
  if (typeof raw.title !== "string" || !raw.title.trim()) throw new ThemeError(`theme ${raw.id}: title must be a non-empty string`);
  const theme = /** @type {Theme} */ (deepMerge(base, raw));
  if (!theme.fonts?.node?.family) throw new ThemeError(`theme ${raw.id}: fonts.node.family is required`);
  return theme;
}

/**
 * Built-in theme metadata, sorted for listings.
 * @returns {Array<{id:string,title:string,description:string,tags:string[],order:number}>}
 */
export function listThemes() {
  init();
  return [...builtins.values()]
    .map((theme) => ({ id: theme.id, title: theme.title, description: theme.description ?? "", tags: theme.tags ?? [], order: theme.order ?? 100 }))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

/**
 * Resolved built-in theme by id.
 * @param {string} id
 * @returns {Theme}
 */
export function getTheme(id) {
  init();
  const theme = builtins.get(id);
  if (!theme) {
    const available = [...builtins.keys()].join(", ");
    throw new ThemeError(`unknown theme ${JSON.stringify(id)}; available themes: ${available}`);
  }
  return theme;
}

/**
 * Load a custom theme from a JSON file, merged over the base defaults.
 * @param {string} path
 * @returns {Theme}
 */
export function loadThemeFile(path) {
  const absolute = resolve(path);
  if (!existsSync(absolute)) throw new ThemeError(`theme file not found: ${absolute}`);
  return mergeTheme(loadJson(absolute));
}

/**
 * Resolve the theme a spec asks for, including per-spec style overrides.
 * A theme value that ends in .json or contains a path separator is treated as
 * a file path; anything else must be a built-in theme id.
 * @param {{theme:string, style?:object|null}} spec
 * @returns {Theme}
 */
export function themeForSpec(spec) {
  const requested = spec.theme ?? "classic";
  const isPath = requested.endsWith(".json") || requested.includes("/") || requested.includes("\\");
  const theme = isPath ? loadThemeFile(requested) : getTheme(requested);
  return spec.style ? /** @type {Theme} */ (deepMerge(theme, spec.style)) : theme;
}
