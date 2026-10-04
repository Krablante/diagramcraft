// Shape geometry shared by the SVG renderer and the layout's endpoint snapping.
// Every node kind knows two things here: how to draw its outline, and where its
// real border is for an incoming or outgoing orthogonal edge.
// @ts-check

/** @typedef {import("./types.js").Theme} Theme */

/**
 * Shape outline for a node kind. `attrs` replaces the paint attributes when
 * provided (used for shine overlays and shadow silhouettes).
 * @param {string} kind
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {Theme} theme
 * @param {string} [attrs]
 */
export function shapePath(kind, x, y, w, h, theme, attrs) {
  if (kind === "junction") return attrs ? `<circle cx="${r(x + w / 2)}" cy="${r(y + h / 2)}" r="${r(w / 2)}" ${attrs}/>` : "";
  if (kind === "connector") return `<circle cx="${r(x + w / 2)}" cy="${r(y + h / 2)}" r="${r(Math.min(w, h) / 2)}" ${attrs ?? ""}/>`;
  if (kind === "decision") {
    const points = [
      [x + w / 2, y],
      [x + w, y + h / 2],
      [x + w / 2, y + h],
      [x, y + h / 2],
    ];
    return `<polygon points="${points.map((p) => p.map((v) => r(v)).join(",")).join(" ")}" ${attrs ?? ""}/>`;
  }
  if (kind === "data") {
    const skew = Math.min(18, w * 0.14);
    const points = [
      [x + skew, y],
      [x + w, y],
      [x + w - skew, y + h],
      [x, y + h],
    ];
    return `<polygon points="${points.map((p) => p.map((v) => r(v)).join(",")).join(" ")}" ${attrs ?? ""}/>`;
  }
  if (kind === "document") {
    const wave = Math.min(12, h * 0.18);
    const d = `M${r(x)},${r(y)} H${r(x + w)} V${r(y + h - wave)} C${r(x + w * 0.72)},${r(y + h + wave * 1.6)} ${r(x + w * 0.28)},${r(y + h - wave * 2.6)} ${r(x)},${r(y + h - wave)} Z`;
    return `<path d="${d}" ${attrs ?? ""}/>`;
  }
  if (kind === "note") {
    const fold = Math.min(16, w * 0.18, h * 0.32);
    const d = `M${r(x)},${r(y)} H${r(x + w - fold)} L${r(x + w)},${r(y + fold)} V${r(y + h)} H${r(x)} Z`;
    return `<path d="${d}" ${attrs ?? ""}/>`;
  }
  const radius = kind === "terminal" ? h / 2 : theme.node.radius;
  return `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${r(radius)}" ${attrs ?? ""}/>`;
}

/** @param {number} value */
function r(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Border coordinate for an orthogonal edge touching a shape side.
 * For "top"/"bottom" sides the input is an x coordinate and the result is a y
 * coordinate; for "left"/"right" sides it is the other way round.
 * @param {string} kind
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @param {Theme} theme
 * @param {"top"|"bottom"|"left"|"right"} side
 * @param {number} coord
 * @returns {number}
 */
export function borderAt(kind, rect, theme, side, coord) {
  const { x, y, w, h } = rect;
  if (kind === "decision") {
    if (side === "top" || side === "bottom") {
      const offset = (Math.abs(coord - (x + w / 2)) / (w / 2)) * (h / 2);
      return side === "top" ? y + Math.min(offset, h / 2) : y + h - Math.min(offset, h / 2);
    }
    const offset = (Math.abs(coord - (y + h / 2)) / (h / 2)) * (w / 2);
    return side === "left" ? x + Math.min(offset, w / 2) : x + w - Math.min(offset, w / 2);
  }
  if (kind === "data") {
    const skew = Math.min(18, w * 0.14);
    if (side === "top") {
      if (coord >= x + skew) return y;
      return y + Math.min(w ? (x + skew - coord) / skew : 0, 1) * h;
    }
    if (side === "bottom") {
      if (coord <= x + w - skew) return y + h;
      return y + h - Math.min((coord - (x + w - skew)) / skew, 1) * h;
    }
    const t = Math.min(Math.max((coord - y) / h, 0), 1);
    return side === "left" ? x + skew * (1 - t) : x + w - skew * t;
  }
  if (kind === "connector" || kind === "junction") {
    const radius = Math.min(w, h) / 2;
    return circleBorder(x + w / 2, y + h / 2, radius, side, coord);
  }
  if (kind === "database") {
    const ry = Math.min(11, h * 0.2);
    const cx = x + w / 2;
    if (side === "top" || side === "bottom") {
      const dx = Math.min(Math.abs(coord - cx) / (w / 2), 1);
      const rise = ry * Math.sqrt(Math.max(0, 1 - dx * dx));
      return side === "top" ? y + ry - rise : y + h - ry + rise;
    }
    const half = w / 2;
    if (coord >= y + ry && coord <= y + h - ry) return side === "left" ? x : x + w;
    const dy = coord < y + ry ? (y + ry - coord) / ry : (coord - (y + h - ry)) / ry;
    const inset = half * Math.sqrt(Math.max(0, 1 - Math.min(dy, 1) ** 2));
    return side === "left" ? x + half - inset : x + half + inset;
  }
  if (kind === "note") {
    const fold = Math.min(16, w * 0.18, h * 0.32);
    if (side === "top" && coord > x + w - fold) return y + Math.min((coord - (x + w - fold)) / fold, 1) * fold;
  }
  const radius = kind === "terminal" ? h / 2 : kind === "note" || kind === "document" ? 0 : theme.node.radius;
  return roundRectBorder(rect, Math.max(0, radius), side, coord);
}

/** @param {number} cx @param {number} cy @param {number} radius @param {string} side @param {number} coord */
function circleBorder(cx, cy, radius, side, coord) {
  if (side === "top" || side === "bottom") {
    const dx = Math.min(Math.abs(coord - cx), radius);
    const rise = Math.sqrt(Math.max(0, radius * radius - dx * dx));
    return side === "top" ? cy - rise : cy + rise;
  }
  const dy = Math.min(Math.abs(coord - cy), radius);
  const run = Math.sqrt(Math.max(0, radius * radius - dy * dy));
  return side === "left" ? cx - run : cx + run;
}

/**
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @param {number} radius
 * @param {string} side
 * @param {number} coord
 */
function roundRectBorder(rect, radius, side, coord) {
  const { x, y, w, h } = rect;
  if (radius <= 0) return side === "top" ? y : side === "bottom" ? y + h : side === "left" ? x : x + w;
  const vertical = side === "top" || side === "bottom";
  const flatStart = vertical ? x + radius : y + radius;
  const flatEnd = vertical ? x + w - radius : y + h - radius;
  let delta = 0;
  if (coord < flatStart) {
    const d = flatStart - coord;
    delta = radius - Math.sqrt(Math.max(0, radius * radius - d * d));
  } else if (coord > flatEnd) {
    const d = coord - flatEnd;
    delta = radius - Math.sqrt(Math.max(0, radius * radius - d * d));
  }
  if (side === "top") return y + delta;
  if (side === "bottom") return y + h - delta;
  if (side === "left") return x + delta;
  return x + w - delta;
}

/**
 * Point on the shape border facing the given outside point.
 * @param {{kind:string,x:number,y:number,w:number,h:number}} node
 * @param {Theme} theme
 * @param {number[]} point
 * @param {number[]} toward - the point just outside the border
 * @returns {number[]}
 */
export function snapToBorder(node, theme, point, toward) {
  const dx = toward[0] - point[0];
  const dy = toward[1] - point[1];
  if (!dx && !dy) return point;
  const horizontal = Math.abs(dx) > Math.abs(dy);
  /** @type {"top"|"bottom"|"left"|"right"} */
  const side = horizontal ? (dx > 0 ? "right" : "left") : dy > 0 ? "bottom" : "top";
  const rect = { x: node.x, y: node.y, w: node.w, h: node.h };
  if (side === "top" || side === "bottom") {
    return [point[0], borderAt(node.kind, rect, theme, side, point[0])];
  }
  return [borderAt(node.kind, rect, theme, side, point[1]), point[1]];
}
