// PNG rasterization with resvg (bundled fonts, no browser needed).
// @ts-check
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {string[]|null} */
let fontCache = null;

/** Absolute paths of the bundled OFL fonts. */
export function bundledFontFiles() {
  if (!fontCache) {
    const dir = join(here, "..", "assets", "fonts");
    fontCache = readdirSync(dir)
      .filter((file) => file.endsWith(".ttf"))
      .map((file) => join(dir, file));
  }
  return fontCache;
}

/**
 * @param {string} svg
 * @param {{scale?:number, systemFonts?:boolean, fontFiles?:string[]}} [options]
 * @returns {Buffer}
 */
export function svgToPng(svg, options = {}) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "zoom", value: options.scale ?? 2 },
    font: {
      fontFiles: options.fontFiles ?? bundledFontFiles(),
      loadSystemFonts: options.systemFonts ?? false,
      defaultFontFamily: "Inter",
    },
  });
  return resvg.render().asPng();
}
