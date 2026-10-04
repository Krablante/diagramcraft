// DiagramCraft public API. This is the primary interface: render a spec
// object to SVG, PNG and ASCII without touching the CLI.
// @ts-check
import { parseSpec } from "./spec.js";
import { layoutSpec } from "./layout.js";
import { renderSvg } from "./svg.js";
import { renderAscii } from "./ascii.js";
import { svgToPng } from "./png.js";
import { getTheme, loadThemeFile, listThemes, themeForSpec } from "./themes.js";
import { deepMerge } from "./util.js";

export { parseSpec, SpecError } from "./spec.js";
export { layoutSpec } from "./layout.js";
export { renderSvg } from "./svg.js";
export { renderAscii } from "./ascii.js";
export { svgToPng, bundledFontFiles } from "./png.js";
export { getTheme, loadThemeFile, listThemes } from "./themes.js";

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

  /** @type {import("./types.js").Theme} */
  let theme;
  if (options.theme && typeof options.theme === "object") theme = /** @type {any} */ (options.theme);
  else if (typeof options.theme === "string" && options.theme !== spec.theme) {
    const requested = options.theme;
    const isPath = requested.endsWith(".json") || requested.includes("/") || requested.includes("\\");
    theme = isPath ? loadThemeFile(requested) : getTheme(requested);
  } else theme = themeForSpec(spec);
  if (spec.style) theme = /** @type {any} */ (deepMerge(theme, spec.style));

  const model = await layoutSpec(spec, theme);
  const formats = options.formats?.length ? options.formats : spec.output?.formats ?? ["svg"];
  const svg = renderSvg(model, theme, spec, { transparent: options.transparent ?? spec.output?.transparent ?? false });

  /** @type {{spec:any,theme:any,model:any,svg:string,png?:Buffer,ascii?:string}} */
  const result = { spec, theme, model, svg };
  if (formats.includes("png")) result.png = svgToPng(svg, { scale: options.scale ?? spec.output?.scale ?? 2, systemFonts: options.systemFonts });
  if (formats.includes("ascii")) result.ascii = await renderAscii(spec, theme, { charset: /** @type {any} */ (options.charset ?? spec.output?.charset ?? "unicode") });
  return result;
}
