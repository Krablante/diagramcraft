// Text measurement and wrapping against the bundled font metrics.
// @ts-check
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {import("./types.js").FontToken} FontToken */

const here = dirname(fileURLToPath(import.meta.url));
const FALLBACK_RATIO = 0.55;

/** @type {any} */
let cache = null;

function loadMetrics() {
  if (!cache) {
    const raw = JSON.parse(readFileSync(join(here, "..", "assets", "fonts", "metrics.json"), "utf8"));
    for (const family of Object.values(raw)) {
      for (const face of Object.values(family.weights)) {
        const map = new Map();
        const chars = face.chars;
        for (let i = 0; i < chars.length; i++) map.set(chars[i], face.advances[i]);
        face.map = map;
        face.average = face.advances.reduce((a, b) => a + b, 0) / face.advances.length;
      }
    }
    cache = raw;
  }
  return cache;
}

/**
 * @param {string} family
 * @param {number} weight
 */
function faceFor(family, weight) {
  const metrics = loadMetrics();
  const entry = metrics[family];
  if (!entry) return null;
  const weights = Object.keys(entry.weights).map(Number);
  let best = weights[0];
  for (const candidate of weights) {
    if (Math.abs(candidate - weight) < Math.abs(best - weight)) best = candidate;
  }
  return entry.weights[String(best)];
}

/**
 * Width of a single text run in pixels.
 * @param {string} text
 * @param {{family:string,size:number,weight?:number,spacing?:number}} font
 */
export function measureText(text, font) {
  const value = String(text ?? "");
  if (!value) return 0;
  const face = faceFor(font.family, font.weight ?? 400);
  let units = 0;
  let characters = 0;
  for (const ch of value) {
    characters += 1;
    const advance = face?.map.get(ch);
    units += face ? typeof advance === "number" ? advance : face.average * FALLBACK_RATIO * 1.6 : FALLBACK_RATIO;
  }
  return (units / (face?.unitsPerEm ?? 1)) * font.size + Math.max(0, characters - 1) * (font.spacing ?? 0);
}

/**
 * Greedy word wrap. Long words are split at character level so they never
 * overflow the requested width.
 * @param {string} text
 * @param {{family:string,size:number,weight?:number,spacing?:number}} font
 * @param {number} maxWidth
 * @returns {string[]}
 */
export function wrapText(text, font, maxWidth) {
  const out = [];
  for (const paragraph of String(text ?? "").split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = "";
    let width = 0;
    const space = measureText(" ", font) + 2 * (font.spacing ?? 0);
    for (const word of words) {
      const wordWidth = measureText(word, font);
      if (line && width + space + wordWidth > maxWidth) {
        out.push(line);
        line = "";
        width = 0;
      }
      if (wordWidth <= maxWidth) {
        width += (line ? space : 0) + wordWidth;
        line += `${line ? " " : ""}${word}`;
        continue;
      }
      // Measure each character once instead of repeatedly measuring growing runs.
      for (const ch of word) {
        const advance = measureText(ch, font);
        if (line && width + advance + (font.spacing ?? 0) > maxWidth) {
          out.push(line);
          line = "";
          width = 0;
        }
        width += advance + (line ? font.spacing ?? 0 : 0);
        line += ch;
      }
    }
    out.push(line);
  }
  return out.length ? out : [""];
}

/**
 * Width of the widest line.
 * @param {string[]} lines
 * @param {{family:string,size:number,weight?:number,spacing?:number}} font
 */
export function widestLine(lines, font) {
  let width = 0;
  for (const line of lines) width = Math.max(width, measureText(line, font));
  return width;
}

/**
 * Height of a text block using the font's line height (defaults to 1.35).
 * @param {string[]} lines
 * @param {FontToken} font
 */
export function blockHeight(lines, font) {
  const lineHeight = (font.lineHeight ?? 1.35) * font.size;
  return lines.length * lineHeight;
}
