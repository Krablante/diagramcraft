// Theme loading: JSON token sets merged over an internal base theme.
// @ts-check
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deepMerge } from "./util.js";

/** @typedef {import("./types.js").Theme} Theme */

const here = dirname(fileURLToPath(import.meta.url));
const builtinDir = join(here, "..", "themes");
// Keep saved specs using retired theme ids renderable without cluttering listings.
const aliases = new Map([["midnight", "dark"]]);

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
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ThemeError("theme must be a JSON object");
  if (typeof raw.id !== "string" || !raw.id.trim()) throw new ThemeError("theme.id must be a non-empty string");
  if (typeof raw.title !== "string" || !raw.title.trim()) throw new ThemeError(`theme ${raw.id}: title must be a non-empty string`);
  const theme = /** @type {Theme} */ (deepMerge(base, raw));
  for (const section of ["canvas", "fonts", "node", "edge", "zone", "heading", "footer", "layout"]) {
    if (!theme[section] || typeof theme[section] !== "object" || Array.isArray(theme[section])) throw new ThemeError(`theme ${raw.id}: ${section} must be an object`);
  }
  for (const role of Object.keys(base.fonts)) {
    const font = theme.fonts[role];
    if (!font || typeof font.family !== "string" || !font.family.trim()) throw new ThemeError(`theme ${raw.id}: fonts.${role}.family must be a nonempty string`);
    if (!Number.isFinite(font.size) || font.size <= 0) throw new ThemeError(`theme ${raw.id}: fonts.${role}.size must be a positive number`);
    if (font.lineHeight !== undefined && (!Number.isFinite(font.lineHeight) || font.lineHeight <= 0)) throw new ThemeError(`theme ${raw.id}: fonts.${role}.lineHeight must be a positive number`);
    if (font.spacing !== undefined && !Number.isFinite(font.spacing)) throw new ThemeError(`theme ${raw.id}: fonts.${role}.spacing must be a finite number`);
  }
  for (const [section, keys] of Object.entries({ canvas: ["padding", "minWidth"], node: ["minWidth", "maxTextWidth", "padX", "padY"], layout: ["nodeGap", "rankGap", "edgeGap"] })) {
    for (const key of keys) if (!Number.isFinite(theme[section][key]) || theme[section][key] < 0 || (key === "maxTextWidth" && theme[section][key] === 0)) throw new ThemeError(`theme ${raw.id}: ${section}.${key} must be ${key === "maxTextWidth" ? "positive" : "nonnegative"}`);
  }
  for (const [path, glass] of [["node.glass", theme.node.glass], ...Object.entries(theme.node.kinds ?? {}).map(([kind, value]) => [`node.kinds.${kind}.glass`, value?.glass])]) {
    if (glass == null) continue;
    if (typeof glass !== "object" || Array.isArray(glass)) throw new ThemeError(`theme ${raw.id}: ${path} must be an object or null`);
    for (const key of ["refraction", "edgeRefraction", "bevelWidth", "rimWidth"]) {
      const positive = key === "refraction" || key === "edgeRefraction";
      if (glass[key] !== undefined && (!Number.isFinite(glass[key]) || (positive ? glass[key] <= 0 : glass[key] < 0))) throw new ThemeError(`theme ${raw.id}: ${path}.${key} must be ${positive ? "positive" : "nonnegative"}`);
    }
  }
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
  const theme = builtins.get(aliases.get(id) ?? id);
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
