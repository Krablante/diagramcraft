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
 * @param {{family:string,size:number,weight?:number}} font
 */
export function measureText(text, font) {
  const value = String(text ?? "");
  if (!value) return 0;
  const face = faceFor(font.family, font.weight ?? 400);
  if (!face) return value.length * font.size * FALLBACK_RATIO;
  let units = 0;
  for (const ch of value) {
    const advance = face.map.get(ch);
    units += typeof advance === "number" ? advance : face.average * FALLBACK_RATIO * 1.6;
  }
  return (units / face.unitsPerEm) * font.size;
}

/** @param {string} text @param {{family:string,size:number,weight?:number}} font */
export function measureLines(text, font) {
  return String(text ?? "")
    .split("\n")
    .map((line) => measureText(line, font));
}

/**
 * Greedy word wrap. Long words are split at character level so they never
 * overflow the requested width.
 * @param {string} text
 * @param {{family:string,size:number,weight?:number}} font
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
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measureText(candidate, font) <= maxWidth || !line) {
        line = candidate;
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out.length ? out : [""];
}

/**
 * Width of the widest line.
 * @param {string[]} lines
 * @param {{family:string,size:number,weight?:number}} font
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
