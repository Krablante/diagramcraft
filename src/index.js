// Dorpie public API. This is the primary interface: render a spec
// object to SVG, PNG and ASCII without touching the CLI.
// @ts-check
import { parseSpec, SpecError } from "./spec.js";
import { layoutSpec } from "./layout.js";
import { renderSvg } from "./svg.js";
import { renderAscii } from "./ascii.js";
import { svgToPng } from "./png.js";
import { getTheme, loadThemeFile, mergeTheme } from "./themes.js";
import { deepMerge } from "./util.js";

export { parseSpec, SpecError } from "./spec.js";
export { layoutSpec } from "./layout.js";
export { renderSvg } from "./svg.js";
export { renderAscii } from "./ascii.js";
export { svgToPng, bundledFontFiles } from "./png.js";
export { getTheme, loadThemeFile, listThemes, ThemeError } from "./themes.js";
export { createLibrary, resolveConfig, LibraryError } from "./library.js";

/**
 * Render a spec (raw object or JSON string) into the requested formats.
 *
 * @param {object|string} input spec object or JSON text
 * @param {{
 *   theme?: string|object,
 *   formats?: Array<"svg"|"png"|"ascii">,
 *   scale?: number,
 *   transparent?: boolean,
 *   systemFonts?: boolean,
 *   charset?: "unicode"|"ascii",
 * }} [options]
 * @returns {Promise<{spec:import("./types.js").Spec, theme:import("./types.js").Theme, model:import("./types.js").Model, svg:string, png?:Buffer, ascii?:string}>}
 */
export async function render(input, options = {}) {
  const raw = typeof input === "string" ? JSON.parse(input) : input;
  const spec = parseSpec(raw);
  const issue = (/** @type {string} */ path, /** @type {string} */ message) => { throw new SpecError([{ path, message }]); };
  if (options.formats !== undefined && (!Array.isArray(options.formats) || options.formats.some((f) => !["svg", "png", "ascii"].includes(f)))) issue("formats", "expected an array of svg, png and/or ascii");
  if (options.scale !== undefined && (!Number.isFinite(options.scale) || options.scale <= 0)) issue("scale", "must be a positive number");
  if (options.charset !== undefined && !["unicode", "ascii"].includes(options.charset)) issue("charset", "must be unicode or ascii");
  for (const key of ["transparent", "systemFonts"]) if (options[key] !== undefined && typeof options[key] !== "boolean") issue(key, "must be a boolean");

  /** @type {import("./types.js").Theme} */
  let theme;
  if (options.theme && typeof options.theme === "object") theme = mergeTheme(options.theme);
  else {
    const requested = options.theme ?? spec.theme;
    const isPath = requested.endsWith(".json") || requested.includes("/") || requested.includes("\\");
    theme = isPath ? loadThemeFile(requested) : getTheme(requested);
  }
  if (spec.style) theme = mergeTheme(deepMerge(theme, spec.style));

  const model = await layoutSpec(spec, theme);
  const formats = options.formats?.length ? options.formats : spec.output?.formats ?? ["svg"];
  const svg = renderSvg(model, theme, spec, { transparent: options.transparent ?? spec.output?.transparent ?? false });

  /** @type {{spec:any,theme:any,model:any,svg:string,png?:Buffer,ascii?:string}} */
  const result = { spec, theme, model, svg };
  if (formats.includes("png")) result.png = svgToPng(svg, { scale: options.scale ?? spec.output?.scale ?? 2, systemFonts: options.systemFonts });
  if (formats.includes("ascii")) result.ascii = await renderAscii(spec, theme, { charset: /** @type {any} */ (options.charset ?? spec.output?.charset ?? "unicode") });
  return result;
}
