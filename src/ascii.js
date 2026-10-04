// ASCII renderer. Layout runs in character-cell space so that boxes, edges and
// labels land on the same grid as the ASCII frame characters.
// @ts-check
import { layoutSpec } from "./layout.js";

/** @typedef {import("./types.js").Spec} Spec */
/** @typedef {import("./types.js").Theme} Theme */

const CELL_W = 8;
const CELL_H = 18;
const BITS = { N: 1, E: 2, S: 4, W: 8 };

/** @type {Record<number, string>} */
const GLYPHS = {
  [BITS.N]: "│",
  [BITS.S]: "│",
  [BITS.E]: "─",
  [BITS.W]: "─",
  [BITS.N | BITS.S]: "│",
  [BITS.E | BITS.W]: "─",
  [BITS.S | BITS.E]: "┌",
  [BITS.S | BITS.W]: "┐",
  [BITS.N | BITS.E]: "└",
  [BITS.N | BITS.W]: "┘",
  [BITS.N | BITS.S | BITS.E]: "├",
  [BITS.N | BITS.S | BITS.W]: "┤",
  [BITS.E | BITS.W | BITS.S]: "┬",
  [BITS.E | BITS.W | BITS.N]: "┴",
  [BITS.N | BITS.E | BITS.S | BITS.W]: "┼",
};

/** @type {[string, string, string, string, string, string]} */
const BOX = ["╭", "╮", "╰", "╯", "─", "│"];
const BOX_DOUBLE = ["╔", "╗", "╚", "╝", "═", "║"];
const BOX_DIAMOND = ["╱", "╲", "╲", "╱", "─", "│"];

const ASCII_MAP = {
  "╭": "+", "╮": "+", "╰": "+", "╯": "+", "┌": "+", "┐": "+", "└": "+", "┘": "+",
  "─": "-", "│": "|", "═": "=", "║": "|", "╔": "+", "╗": "+", "╚": "+", "╝": "+",
  "├": "+", "┤": "+", "┬": "+", "┴": "+", "┼": "+", "╱": "/", "╲": "\\",
  "▶": ">", "◀": "<", "▼": "v", "▲": "^", "●": "*",
};

/**
 * Render a spec as an ASCII / Unicode box-drawing diagram.
 * @param {Spec} spec
 * @param {Theme} theme
 * @param {{charset?:"unicode"|"ascii"}} [options]
 * @returns {Promise<string>}
 */
export async function renderAscii(spec, theme, options = {}) {
  const sizes = new Map(spec.nodes.map((node) => [node.id, asciiNodeSize(node, theme)]));
  const spacing = {
    nodeGap: snapUp(theme.layout.nodeGap, CELL_W),
    rankGap: snapUp(theme.layout.rankGap, CELL_H),
    edgeGap: snapUp(theme.layout.edgeGap ?? 16, CELL_W),
  };
  const model = await layoutSpec(spec, theme, {
    nodeSize: (node) => sizes.get(node.id),
    edgeLabelSize: (edge) => ({ w: (displayWidth(edge.label ?? "") + 2) * CELL_W, h: CELL_H }),
    spacing,
  });

  /** @type {Map<string,string>} */
  const frame = new Map();
  /** @type {Map<string,number>} */
  const bits = new Map();
  /** @type {Map<string,string>} */
  const overlay = new Map();
  /** @type {Map<string,{x0:number,y0:number,x1:number,y1:number}>} */
  const boxes = new Map();

  const key = (/** @type {number} */ x, /** @type {number} */ y) => `${x},${y}`;

  // ---- node frames ---------------------------------------------------------
  const ordered = [...model.nodes].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const node of ordered) {
    const size = sizes.get(node.id);
    if (!size) continue;
    const width = Math.max(1, Math.round(node.w / CELL_W));
    const height = Math.max(1, Math.round(node.h / CELL_H));
    let x0 = Math.round(node.x / CELL_W);
    let y0 = Math.round(node.y / CELL_H);
    let guard = 0;
    while (rangeOccupied(frame, x0, y0, width, height) && guard++ < 200) y0 += 1;
    const box = { x0, y0, x1: x0 + width - 1, y1: y0 + height - 1 };
    boxes.set(node.id, box);

    if (node.kind === "junction") {
      frame.set(key(x0, y0), "●");
      continue;
    }
    if (node.kind === "connector") {
      const label = node.lines[0] ?? "";
      putText(overlay, x0, y0, `(${label})`);
      continue;
    }
    const [tl, tr, bl, br, hz, vt] = boxStyle(node.kind);
    for (let x = x0 + 1; x < x0 + width - 1; x++) {
      frame.set(key(x, y0), hz);
      frame.set(key(x, y0 + height - 1), hz);
    }
    for (let y = y0 + 1; y < y0 + height - 1; y++) {
      frame.set(key(x0, y), vt);
      frame.set(key(x0 + width - 1, y), vt);
    }
    frame.set(key(x0, y0), tl);
    frame.set(key(x0 + width - 1, y0), tr);
    frame.set(key(x0, y0 + height - 1), bl);
    frame.set(key(x0 + width - 1, y0 + height - 1), br);

    let row = y0 + 1;
    for (const line of node.lines.length ? node.lines : [node.id]) {
      putText(frame, x0 + 1, row, center(line, width - 2));
      row += 1;
    }
    if (node.noteLines.length) {
      row += 1;
      for (const line of node.noteLines) {
        putText(frame, x0 + 1, row, center(line, width - 2));
        row += 1;
      }
    }
  }

  // ---- edges ---------------------------------------------------------------
  for (const edge of model.edges) {
    const source = boxes.get(edge.from);
    const target = boxes.get(edge.to);
    if (!source || !target) continue;
    const path = edge.paths[edge.paths.length - 1];
    if (!path || path.length < 2) continue;

    const start = clipToBox(source, path[0], path[1]);
    const end = clipToBox(target, path[path.length - 1], path[path.length - 2]);
    /** @type {number[][]} */
    const cells = [start];
    for (const point of path.slice(1, -1)) {
      const gx = Math.round(point[0] / CELL_W);
      const gy = Math.round(point[1] / CELL_H);
      const last = cells[cells.length - 1];
      if (last[0] === gx && last[1] === gy) continue;
      if (last[0] !== gx && last[1] !== gy) cells.push([gx, last[1]]);
      cells.push([gx, gy]);
    }
    const last = cells[cells.length - 1];
    if (last[0] !== end[0] && last[1] !== end[1]) cells.push([end[0], last[1]]);
    cells.push(end);

    for (let i = 0; i < cells.length - 1; i++) stampSegment(cells[i], cells[i + 1], bits, frame);
    if (edge.arrow !== "none") {
      const beforeEnd = cells[cells.length - 2] ?? cells[0];
      overlay.set(key(end[0], end[1]), arrowGlyph(beforeEnd, end));
    }
  }

  // ---- edge labels ---------------------------------------------------------
  for (const edge of model.edges) {
    if (!edge.label || !edge.labelBox) continue;
    const cx = Math.round((edge.labelBox.x + edge.labelBox.w / 2) / CELL_W);
    const cy = Math.round((edge.labelBox.y + edge.labelBox.h / 2) / CELL_H);
    putText(overlay, cx - Math.floor((edge.label.length + 2) / 2), cy, ` ${edge.label} `, true);
  }

  // ---- assemble ------------------------------------------------------------
  const cells = new Set([...frame.keys(), ...bits.keys(), ...overlay.keys()]);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    const [x, y] = cell.split(",").map(Number);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return "";

  const rows = [];
  for (let y = minY; y <= maxY; y++) {
    let line = "";
    for (let x = minX; x <= maxX; x++) {
      const k = key(x, y);
      line += frame.get(k) ?? overlay.get(k) ?? GLYPHS[bits.get(k) ?? 0] ?? " ";
    }
    rows.push(line.replace(/\s+$/, ""));
  }

  const header = [];
  if (spec.title) header.push(spec.title);
  if (spec.subtitle) header.push(spec.subtitle);
  if (header.length) header.push("");
  if (spec.footer) rows.push("", spec.footer);

  let text = [...header, ...rows].join("\n");
  if (options.charset === "ascii") text = text.replace(/[^\x00-\x7F]/g, (ch) => ASCII_MAP[ch] ?? "?");
  return `${text}\n`;
}

/**
 * Character-space node size: box width and height in cells.
 * @param {import("./types.js").SpecNode} node
 * @param {Theme} theme
 */
function asciiNodeSize(node, theme) {
  if (node.kind === "junction") return { lines: [], noteLines: [], labelFont: theme.fonts.node, w: CELL_W, h: CELL_H };
  const lines = wrapChars(node.label, node.kind === "connector" ? 20 : 24);
  const noteLines = node.note ? wrapChars(node.note, 28) : [];
  const inner = Math.max(3, ...lines.map(displayWidth), ...noteLines.map(displayWidth));
  const height = lines.length + (noteLines.length ? noteLines.length + 1 : 0) + 2;
  return { lines, noteLines, labelFont: theme.fonts.node, w: (inner + 2) * CELL_W, h: height * CELL_H };
}

/**
 * @param {Map<string,string>} frame
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 */
function rangeOccupied(frame, x, y, w, h) {
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) if (frame.has(`${x + i},${y + j}`)) return true;
  return false;
}

/**
 * Grid cell just outside the border, in the direction the path leaves the
 * border (towards the next point on the route).
 * @param {{x0:number,y0:number,x1:number,y1:number}} box
 * @param {number[]} borderPoint
 * @param {number[]} nextPoint
 */
function clipToBox(box, borderPoint, nextPoint) {
  const dx = nextPoint[0] - borderPoint[0];
  const dy = nextPoint[1] - borderPoint[1];
  const vertical = Math.abs(dy) >= Math.abs(dx);
  const cx = Math.round(borderPoint[0] / CELL_W);
  const cy = Math.round(borderPoint[1] / CELL_H);
  if (vertical) {
    const y = dy > 0 ? box.y1 + 1 : box.y0 - 1;
    return [clamp(cx, box.x0, box.x1), y];
  }
  const x = dx > 0 ? box.x1 + 1 : box.x0 - 1;
  return [x, clamp(cy, box.y0, box.y1)];
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * @param {number[]} from
 * @param {number[]} to
 * @param {Map<string,number>} bits
 * @param {Map<string,string>} frame
 */
function stampSegment(from, to, bits, frame) {
  let [x, y] = from;
  const [tx, ty] = to;
  const stepX = Math.sign(tx - x);
  const stepY = Math.sign(ty - y);
  let guard = 0;
  while ((x !== tx || y !== ty) && guard++ < 5000) {
    let nx = x;
    let ny = y;
    if (x !== tx) nx += stepX;
    else ny += stepY;
    if (!frame.has(`${x},${y}`)) bits.set(`${x},${y}`, (bits.get(`${x},${y}`) ?? 0) | directionMask(x, y, nx, ny));
    if (!frame.has(`${nx},${ny}`)) bits.set(`${nx},${ny}`, (bits.get(`${nx},${ny}`) ?? 0) | directionMask(nx, ny, x, y));
    x = nx;
    y = ny;
  }
}

/** @param {number} x @param {number} y @param {number} nx @param {number} ny */
function directionMask(x, y, nx, ny) {
  if (nx > x) return BITS.E;
  if (nx < x) return BITS.W;
  if (ny > y) return BITS.S;
  return BITS.N;
}

/** @param {number[]} from @param {number[]} to */
function arrowGlyph(from, to) {
  if (to[0] > from[0]) return "▶";
  if (to[0] < from[0]) return "◀";
  if (to[1] > from[1]) return "▼";
  return "▲";
}

/** @param {string} kind */
function boxStyle(kind) {
  if (kind === "terminal") return BOX_DOUBLE;
  if (kind === "decision" || kind === "data" || kind === "document" || kind === "database") return BOX_DIAMOND;
  return BOX;
}

/**
 * @param {Map<string,string>} target
 * @param {number} x
 * @param {number} y
 * @param {string} text
 * @param {boolean} [overwrite]
 */
function putText(target, x, y, text, overwrite = false) {
  let cursor = x;
  for (const ch of text) {
    if (ch !== " " && (overwrite || !target.has(`${cursor},${y}`))) target.set(`${cursor},${y}`, ch);
    cursor += 1;
  }
}

/** @param {string} text @param {number} width */
function center(text, width) {
  const w = displayWidth(text);
  if (w >= width) return text;
  return `${" ".repeat(Math.floor((width - w) / 2))}${text}`;
}

/** @param {string} text @param {number} maxWidth */
function wrapChars(text, maxWidth) {
  const out = [];
  for (const paragraph of String(text).split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      if (!line) line = word;
      else if (displayWidth(`${line} ${word}`) <= maxWidth) line += ` ${word}`;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out.flatMap((line) => {
    if (displayWidth(line) <= maxWidth) return [line];
    const chunks = [];
    let chunk = "";
    for (const ch of line) {
      if (displayWidth(chunk + ch) > maxWidth && chunk) {
        chunks.push(chunk);
        chunk = ch;
      } else chunk += ch;
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  });
}

/** @param {string} text */
function displayWidth(text) {
  let width = 0;
  for (const ch of text) width += isWide(ch) ? 2 : 1;
  return width;
}

/** @param {string} ch */
function isWide(ch) {
  const cp = ch.codePointAt(0) ?? 0;
  return (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60);
}

/** @param {number} value @param {number} unit */
function snapUp(value, unit) {
  return Math.max(unit, Math.ceil(value / unit) * unit);
}
