// SVG renderer: geometry model + theme -> self-contained SVG string.
// @ts-check
import { blockHeight, measureText, widestLine } from "./text.js";
import { deepMerge, escapeXml, hashString, round, slug } from "./util.js";

/** @typedef {import("./types.js").Spec} Spec */
/** @typedef {import("./types.js").Theme} Theme */
/** @typedef {import("./types.js").Model} Model */
/** @typedef {import("./types.js").Paint} Paint */

/**
 * @param {Model} model
 * @param {Theme} theme
 * @param {Spec} spec
 * @param {{transparent?:boolean}} [options]
 * @returns {string}
 */
export function renderSvg(model, theme, spec, options = {}) {
  const defs = new Map();
  const defList = [];
  let defCounter = 0;

  const define = (/** @type {string} */ key, /** @type {(id:string)=>string} */ make) => {
    if (defs.has(key)) return defs.get(key);
    const id = `d${defCounter++}`;
    defs.set(key, id);
    defList.push(make(id));
    return id;
  };

  /** @param {Paint} paint @returns {string} */
  const paintValue = (paint) => {
    if (!paint || paint.type === "solid" || !paint.type) return paint?.color ?? "none";
    const key = JSON.stringify(paint);
    return `url(#${define(key, (id) => gradientBody(paint, id))})`;
  };

  /** @param {Paint} paint */
  function gradientBody(paint, id) {
    const stops = (paint.stops ?? [])
      .map(([offset, color]) => `<stop offset="${round(offset, 3)}" stop-color="${color}"/>`)
      .join("");
    if (paint.type === "radial") {
      const [cx, cy] = paint.center ?? [0.5, 0.5];
      return `<radialGradient id="${id}" cx="${round(cx, 3)}" cy="${round(cy, 3)}" r="${round(paint.radius ?? 0.7, 3)}">${stops}</radialGradient>`;
    }
    const angle = ((paint.angle ?? 90) * Math.PI) / 180;
    const dx = Math.cos(angle) / 2;
    const dy = Math.sin(angle) / 2;
    return `<linearGradient id="${id}" x1="${round(0.5 - dx, 4)}" y1="${round(0.5 - dy, 4)}" x2="${round(0.5 + dx, 4)}" y2="${round(0.5 + dy, 4)}">${stops}</linearGradient>`;
  }

  /** @param {object|null} shadow @param {object|null} glow */
  function nodeFilter(shadow, glow) {
    if (!shadow && !glow) return "";
    const parts = [];
    if (glow) parts.push(`<feGaussianBlur stdDeviation="${glow.blur}" result="g"/>`, `<feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>`);
    if (shadow) parts.push(`<feDropShadow dx="${shadow.x ?? 0}" dy="${shadow.y}" stdDeviation="${shadow.blur}" flood-color="${shadow.color}" flood-opacity="${shadow.opacity}"/>`);
    if (glow && shadow) {
      // Combine glow and shadow in one filter: drop shadow first, then blur the result.
      const shadowOnly = `<feDropShadow dx="${shadow.x ?? 0}" dy="${shadow.y}" stdDeviation="${shadow.blur}" flood-color="${shadow.color}" flood-opacity="${shadow.opacity}" result="s"/>`;
      return `<filter x="-40%" y="-40%" width="180%" height="180%">${shadowOnly}<feGaussianBlur in="s" stdDeviation="${glow.blur}" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="s"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    }
    return `<filter x="-40%" y="-40%" width="180%" height="180%">${parts.join("")}</filter>`;
  }

  const pad = theme.canvas.padding;
  const titleFont = theme.fonts.title;
  const subtitleFont = theme.fonts.subtitle;
  const footerFont = theme.fonts.footer;

  const titleLines = spec.title ? wrapNo(spec.title) : [];
  const subtitleLines = spec.subtitle ? wrapNo(spec.subtitle) : [];
  const footerLines = spec.footer ? wrapNo(spec.footer) : [];

  const titleWidth = Math.max(titleLines.length ? widestLine(titleLines, titleFont) : 0, subtitleLines.length ? widestLine(subtitleLines, subtitleFont) : 0);
  const contentWidth = Math.max(model.width, theme.canvas.minWidth, titleWidth);
  const width = Math.ceil(contentWidth + pad * 2);
  const titleBlockHeight = titleLines.length ? blockHeight(titleLines, titleFont) + (subtitleLines.length ? theme.heading.subtitleGap + blockHeight(subtitleLines, subtitleFont) : 0) + theme.heading.gap : 0;
  const footerBlockHeight = footerLines.length ? theme.footer.gap + blockHeight(footerLines, footerFont) : 0;
  const height = Math.ceil(titleBlockHeight + model.height + footerBlockHeight + pad * 2);
  const originX = pad;
  const originY = pad + titleBlockHeight;

  /** @type {string[]} */
  const layers = [];

  // ---- canvas background -------------------------------------------------
  if (!options.transparent) {
    /** @type {string[]} */
    const bgLayers = [];
    const bg = paintValue(theme.canvas.background);
    bgLayers.push(`<rect width="${width}" height="${height}" fill="${bg}"/>`);
    for (const blob of theme.canvas.blobs ?? []) {
      const id = define(
        `blob:${JSON.stringify(blob)}`,
        (defId) => `<radialGradient id="${defId}" cx="${round(blob.cx, 3)}" cy="${round(blob.cy, 3)}" r="${round(blob.r, 3)}"><stop offset="0" stop-color="${blob.color}" stop-opacity="${blob.opacity ?? 1}"/><stop offset="1" stop-color="${blob.color}" stop-opacity="0"/></radialGradient>`,
      );
      bgLayers.push(`<rect width="${width}" height="${height}" fill="url(#${id})"/>`);
    }
    const texture = theme.canvas.texture;
    if (texture) {
      const key = `texture:${JSON.stringify(texture)}`;
      const id = define(key, (defId) => textureBody(texture, defId));
      bgLayers.push(`<rect width="${width}" height="${height}" fill="url(#${id})"/>`);
    }
    if (theme.canvas.vignette) {
      const v = theme.canvas.vignette;
      const id = define(
        `vignette:${JSON.stringify(v)}`,
        (defId) => `<radialGradient id="${defId}" cx="0.5" cy="0.5" r="${round(v.size ?? 0.72, 3)}"><stop offset="0.45" stop-color="${v.color}" stop-opacity="0"/><stop offset="1" stop-color="${v.color}" stop-opacity="${v.opacity}"/></radialGradient>`,
      );
      bgLayers.push(`<rect width="${width}" height="${height}" fill="url(#${id})"/>`);
    }
    const radius = theme.canvas.radius ?? 0;
    if (radius > 0) {
      const clipId = define(`clip:${width}x${height}x${radius}`, (defId) => `<clipPath id="${defId}"><rect width="${width}" height="${height}" rx="${radius}"/></clipPath>`);
      layers.push(`<g clip-path="url(#${clipId})">${bgLayers.join("")}</g>`);
    } else {
      layers.push(...bgLayers);
    }
  }

  /** @param {any} texture @param {string} id */
  function textureBody(texture, id) {
    if (texture.type === "noise") {
      const frequency = round(0.85 * (texture.scale ?? 1), 3);
      return `<filter id="${id}f" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="3" seed="${texture.seed ?? 7}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${texture.opacity ?? 0.05} 0"/></filter><pattern id="${id}" width="180" height="180" patternUnits="userSpaceOnUse"><rect width="180" height="180" filter="url(#${id}f)"/></pattern>`;
    }
    if (texture.type === "grid") {
      const size = texture.size ?? 24;
      const stroke = texture.color ?? "rgba(0,0,0,0.06)";
      return `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><path d="M ${size} 0 H 0 V ${size}" fill="none" stroke="${stroke}" stroke-width="${texture.width ?? 1}"/></pattern>`;
    }
    if (texture.type === "dots") {
      const size = texture.size ?? 22;
      const stroke = texture.color ?? "rgba(0,0,0,0.12)";
      const radius = texture.radius ?? 1.1;
      return `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="${stroke}"/></pattern>`;
    }
    throw new Error(`unknown texture type ${JSON.stringify(texture.type)}`);
  }

  // ---- zones ---------------------------------------------------------------
  const zoneFont = { ...theme.fonts.zone };
  for (const zone of model.zones) {
    const stroke = theme.zone.stroke ?? {};
    const zoneFill = zone.color ? { type: "solid", color: zone.color } : theme.zone.fill;
    const dash = stroke.dash ? ` stroke-dasharray="${stroke.dash.join(" ")}"` : "";
    const zx = zone.x + originX;
    const zy = zone.y + originY;
    layers.push(
      `<g><rect x="${round(zx)}" y="${round(zy)}" width="${round(zone.w)}" height="${round(zone.h)}" rx="${theme.zone.radius}" fill="${paintValue(zoneFill)}" stroke="${stroke.color ?? "none"}" stroke-width="${stroke.width ?? 0}"${dash}/>`,
    );
    const label = zoneFont.uppercase ? zone.label.toUpperCase() : zone.label;
    const labelColor = theme.zone.labelColor ?? zoneFont.color;
    const labelX = zx + theme.zone.labelPad;
    const labelY = zy + theme.zone.labelPad;
    layers.push(textLine(label, { ...zoneFont, color: labelColor }, labelX, labelY, "start"));
    layers.push(`</g>`);
  }

  // ---- edges ---------------------------------------------------------------
  const kindById = new Map(model.nodes.map((node) => [node.id, node.kind]));
  for (const edge of model.edges) {
    const kindStyle = theme.edge.kinds?.[edge.kind] ?? {};
    const strokeStyle = deepMerge(theme.edge.stroke, kindStyle);
    const color = edge.color ?? strokeStyle.color;
    const dash = strokeStyle.dash ? ` stroke-dasharray="${strokeStyle.dash.join(" ")}"` : "";
    const arrowColor = theme.edge.arrow.color ?? color;
    const markerId = theme.edge.arrow.type === "none" ? null : define(`arrow:${theme.edge.arrow.type}:${arrowColor}:${theme.edge.arrow.size}`, (defId) => markerBody(theme.edge.arrow, arrowColor, defId));
    for (let i = 0; i < edge.paths.length; i++) {
      const last = i === edge.paths.length - 1;
      const points = edge.paths[i].map(([x, y]) => [x + originX, y + originY]);
      const d = roundedPath(points, theme.edge.cornerRadius ?? 0);
      const startMarker = edge.arrow === "both" && i === 0 && markerId ? ` marker-start="url(#${markerId})"` : "";
      const intoJunction = kindById.get(edge.to) === "junction";
      const endMarker = edge.arrow !== "none" && last && markerId && !intoJunction ? ` marker-end="url(#${markerId})"` : "";
      layers.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${strokeStyle.width}" stroke-linecap="round" stroke-linejoin="round"${dash}${startMarker}${endMarker}/>`);
    }
  }

  /** @param {any} arrow @param {string} color @param {string} id */
  function markerBody(arrow, color, id) {
    const size = arrow.size ?? 9;
    if (arrow.type === "vee") {
      return `<marker id="${id}" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="${size}" markerHeight="${size}" orient="auto-start-reverse"><path d="M0.6,0.8 L9,5 L0.6,9.2" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker>`;
    }
    if (arrow.type === "circle") {
      return `<marker id="${id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="${size}" markerHeight="${size}" orient="auto-start-reverse"><circle cx="5" cy="5" r="4" fill="${color}"/></marker>`;
    }
    return `<marker id="${id}" viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="${size}" markerHeight="${size}" orient="auto-start-reverse"><path d="M0.8,0.6 L9.4,5 L0.8,9.4 Z" fill="${color}"/></marker>`;
  }

  // edge labels above edges, below nodes
  for (const edge of model.edges) {
    if (!edge.label || !edge.labelBox) continue;
    const font = theme.fonts.edge;
    const box = edge.labelBox;
    const x = box.x + originX;
    const y = box.y + originY;
    const fill = theme.edge.label.fill;
    const radius = theme.edge.label.radius ?? 4;
    if (fill && fill !== "none") layers.push(`<rect x="${round(x + 1)}" y="${round(y + 1)}" width="${round(box.w - 2)}" height="${round(box.h - 2)}" rx="${radius}" fill="${fill}"/>`);
    layers.push(textLine(edge.label, font, x + box.w / 2, y + box.h / 2, "middle"));
  }

  // ---- nodes ---------------------------------------------------------------
  for (const node of model.nodes) {
    const kindTokens = theme.node.kinds?.[node.kind] ?? {};
    let fill = kindTokens.fill ?? theme.node.fill;
    let stroke = deepMerge(theme.node.stroke, kindTokens.stroke ?? {});
    let shadow = "shadow" in kindTokens ? kindTokens.shadow : theme.node.shadow;
    let glow = "glow" in kindTokens ? kindTokens.glow : theme.node.glow;
    let textColor = node.labelFont.color ?? theme.fonts.node.color;
    if (node.accent) {
      fill = theme.node.accent.fill ?? fill;
      stroke = deepMerge(stroke, theme.node.accent.stroke ?? {});
      textColor = theme.node.accent.text?.color ?? textColor;
    }
    if (node.color) fill = { type: "solid", color: node.color };

    const x = node.x + originX;
    const y = node.y + originY;
    const shape = shapePath(node.kind, x, y, node.w, node.h, theme);
    const filterId = themeFilter(nodeFilter(shadow, glow));
    const dash = stroke.dash ? ` stroke-dasharray="${stroke.dash.join(" ")}"` : "";
    const common = `fill="${paintValue(fill)}" stroke="${stroke.color ?? "none"}" stroke-width="${stroke.width ?? 0}"${dash}${filterId ? ` filter="url(#${filterId})"` : ""}`;
    const group = [`<g data-node="${escapeXml(node.id)}">`];

    if (node.kind === "junction") {
      group.push(`<circle cx="${round(x + node.w / 2)}" cy="${round(y + node.h / 2)}" r="${round(node.w / 2)}" ${common}/>`);
    } else if (node.kind === "connector") {
      group.push(`<circle cx="${round(x + node.w / 2)}" cy="${round(y + node.h / 2)}" r="${round(Math.min(node.w, node.h) / 2)}" ${common}/>`);
    } else if (node.kind === "decision") {
      const points = [
        [x + node.w / 2, y],
        [x + node.w, y + node.h / 2],
        [x + node.w / 2, y + node.h],
        [x, y + node.h / 2],
      ];
      group.push(`<polygon points="${points.map((p) => p.map((v) => round(v)).join(",")).join(" ")}" ${common}/>`);
    } else if (node.kind === "data") {
      const skew = Math.min(18, node.w * 0.14);
      const points = [
        [x + skew, y],
        [x + node.w, y],
        [x + node.w - skew, y + node.h],
        [x, y + node.h],
      ];
      group.push(`<polygon points="${points.map((p) => p.map((v) => round(v)).join(",")).join(" ")}" ${common}/>`);
    } else if (node.kind === "document") {
      const wave = Math.min(12, node.h * 0.18);
      const d = `M${round(x)},${round(y)} H${round(x + node.w)} V${round(y + node.h - wave)} C${round(x + node.w * 0.72)},${round(y + node.h + wave * 1.6)} ${round(x + node.w * 0.28)},${round(y + node.h - wave * 2.6)} ${round(x)},${round(y + node.h - wave)} Z`;
      group.push(`<path d="${d}" ${common}/>`);
    } else if (node.kind === "database") {
      const ry = Math.min(11, node.h * 0.2);
      const cx = x + node.w / 2;
      const d = `M${round(x)},${round(y + ry)} A${round(node.w / 2)},${round(ry)} 0 0 1 ${round(x + node.w)},${round(y + ry)} V${round(y + node.h - ry)} A${round(node.w / 2)},${round(ry)} 0 0 1 ${round(x)},${round(y + node.h - ry)} Z`;
      group.push(`<path d="${d}" ${common}/>`);
      group.push(`<ellipse cx="${round(cx)}" cy="${round(y + ry)}" rx="${round(node.w / 2)}" ry="${round(ry)}" ${common}/>`);
    } else if (node.kind === "note") {
      const fold = Math.min(16, node.w * 0.18, node.h * 0.32);
      const d = `M${round(x)},${round(y)} H${round(x + node.w - fold)} L${round(x + node.w)},${round(y + fold)} V${round(y + node.h)} H${round(x)} Z`;
      group.push(`<path d="${d}" ${common}/>`);
      group.push(`<path d="M${round(x + node.w - fold)},${round(y)} V${round(y + fold)} H${round(x + node.w)}" fill="none" stroke="${stroke.color ?? "none"}" stroke-width="${stroke.width ?? 0}"/>`);
    } else {
      const radius = node.kind === "terminal" ? node.h / 2 : theme.node.radius;
      group.push(`<rect x="${round(x)}" y="${round(y)}" width="${round(node.w)}" height="${round(node.h)}" rx="${round(radius)}" ${common}/>`);
    }

    if (theme.node.shine) {
      const shineId = define(`shine:${JSON.stringify(theme.node.shine)}`, (defId) => gradientBody(theme.node.shine, defId));
      group.push(shapePath(node.kind, x, y, node.w, node.h, theme, `fill="url(#${shineId})" stroke="none"`));
    }

    const lineHeight = (node.labelFont.lineHeight ?? 1.35) * node.labelFont.size;
    const noteFont = theme.fonts.note;
    const noteHeight = node.noteLines.length ? 5 + blockHeight(node.noteLines, noteFont) : 0;
    const totalHeight = blockHeight(node.lines, node.labelFont) + noteHeight;
    let cursor = y + (node.h - totalHeight) / 2;
    if (node.kind !== "junction") {
      for (const line of node.lines) {
        group.push(textLine(line, { ...node.labelFont, color: textColor }, x + node.w / 2, cursor + lineHeight / 2, "middle"));
        cursor += lineHeight;
      }
      for (const line of node.noteLines) {
        group.push(textLine(line, noteFont, x + node.w / 2, cursor + 5 + (noteFont.lineHeight ?? 1.35) * noteFont.size / 2, "middle"));
        cursor += (noteFont.lineHeight ?? 1.35) * noteFont.size;
      }
    }
    group.push(`</g>`);
    layers.push(group.join(""));
  }

  // ---- title and footer ----------------------------------------------------
  if (titleLines.length) {
    const align = theme.heading.align ?? "left";
    const x = align === "center" ? width / 2 : align === "right" ? width - pad : pad;
    const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
    let cursor = pad;
    const titleHeight = blockHeight(titleLines, titleFont);
    for (let i = 0; i < titleLines.length; i++) layers.push(textLine(titleLines[i], titleFont, x, cursor + (i + 0.5) * (titleFont.lineHeight ?? 1.35) * titleFont.size, anchor));
    cursor += titleHeight;
    if (theme.heading.rule) {
      const rule = theme.heading.rule;
      cursor += rule.gap ?? 8;
      const ruleX = align === "center" ? x - (rule.length ?? 56) / 2 : align === "right" ? x - (rule.length ?? 56) : x;
      layers.push(`<rect x="${round(ruleX)}" y="${round(cursor)}" width="${rule.length ?? 56}" height="${rule.width ?? 3}" rx="${(rule.width ?? 3) / 2}" fill="${rule.color}"/>`);
      cursor += (rule.width ?? 3);
    }
    if (subtitleLines.length) {
      cursor += theme.heading.subtitleGap;
      const subHeight = blockHeight(subtitleLines, subtitleFont);
      for (let i = 0; i < subtitleLines.length; i++) layers.push(textLine(subtitleLines[i], subtitleFont, x, cursor + (i + 0.5) * (subtitleFont.lineHeight ?? 1.35) * subtitleFont.size, anchor));
      cursor += subHeight;
    }
  }
  if (footerLines.length) {
    const align = theme.footer.align ?? "left";
    const x = align === "center" ? width / 2 : align === "right" ? width - pad : pad;
    const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
    let cursor = height - pad - blockHeight(footerLines, footerFont);
    for (let i = 0; i < footerLines.length; i++) {
      layers.push(textLine(footerLines[i], footerFont, x, cursor + (i + 0.5) * (footerFont.lineHeight ?? 1.35) * footerFont.size, anchor));
    }
  }

  /** @param {string} text */
  function wrapNo(text) {
    return String(text).split("\n");
  }

  function themeFilter(/** @type {string} */ body) {
    if (!body) return null;
    return define(`filter:${body}`, (id) => body.replace("<filter ", `<filter id="${id}" `));
  }

  /**
   * @param {string} text
   * @param {any} font
   * @param {number} x
   * @param {number} y
   * @param {string} anchor
   */
  function textLine(text, font, x, y, anchor) {
    const attrs = [
      `x="${round(x)}"`,
      `y="${round(y)}"`,
      `font-family="${escapeXml(font.family)}"`,
      `font-size="${round(font.size)}"`,
      `font-weight="${font.weight ?? 400}"`,
      `fill="${font.color}"`,
      `text-anchor="${anchor}"`,
      `dominant-baseline="central"`,
    ];
    if (font.spacing) attrs.push(`letter-spacing="${round(font.spacing)}"`);
    return `<text ${attrs.join(" ")}>${escapeXml(text)}</text>`;
  }

  // Finalize defs with real ids (bodies use a placeholder token).
  const defsXml = defList.join("");

  const label = spec.title ? `<title>${escapeXml(spec.title)}</title>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.title ?? "diagram")}">${label}<defs>${defsXml}</defs>${layers.join("")}</svg>`;
}

/**
 * Rounded orthogonal path through the given points.
 * @param {number[][]} points
 * @param {number} radius
 */
export function roundedPath(points, radius) {
  if (points.length < 2) return "";
  const rounded = points.map(([x, y]) => [round(x), round(y)]);
  if (rounded.length === 2 || !radius) return rounded.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
  let d = `M${rounded[0][0]},${rounded[0][1]}`;
  for (let i = 1; i < rounded.length - 1; i++) {
    const [px, py] = rounded[i - 1];
    const [x, y] = rounded[i];
    const [nx, ny] = rounded[i + 1];
    const inLength = Math.hypot(x - px, y - py);
    const outLength = Math.hypot(nx - x, ny - y);
    if (!inLength || !outLength) continue;
    const r = Math.min(radius, inLength / 2, outLength / 2);
    const a = [x + ((px - x) / inLength) * r, y + ((py - y) / inLength) * r];
    const b = [x + ((nx - x) / outLength) * r, y + ((ny - y) / outLength) * r];
    d += ` L${round(a[0])},${round(a[1])} Q${round(x)},${round(y)} ${round(b[0])},${round(b[1])}`;
  }
  const last = rounded[rounded.length - 1];
  d += ` L${last[0]},${last[1]}`;
  return d;
}

/**
 * Shape outline for a node kind, used for both the main shape and the optional
 * shine overlay. `attrs` replaces the paint attributes when provided.
 * @param {string} kind
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {Theme} theme
 * @param {string} [attrs]
 */
function shapePath(kind, x, y, w, h, theme, attrs) {
  if (kind === "junction") return attrs ? `<circle cx="${round(x + w / 2)}" cy="${round(y + h / 2)}" r="${round(w / 2)}" ${attrs}/>` : "";
  if (kind === "connector") return `<circle cx="${round(x + w / 2)}" cy="${round(y + h / 2)}" r="${round(Math.min(w, h) / 2)}" ${attrs ?? ""}/>`;
  if (kind === "decision") {
    const points = [
      [x + w / 2, y],
      [x + w, y + h / 2],
      [x + w / 2, y + h],
      [x, y + h / 2],
    ];
    return `<polygon points="${points.map((p) => p.map((v) => round(v)).join(",")).join(" ")}" ${attrs ?? ""}/>`;
  }
  if (kind === "data") {
    const skew = Math.min(18, w * 0.14);
    const points = [
      [x + skew, y],
      [x + w, y],
      [x + w - skew, y + h],
      [x, y + h],
    ];
    return `<polygon points="${points.map((p) => p.map((v) => round(v)).join(",")).join(" ")}" ${attrs ?? ""}/>`;
  }
  if (kind === "document") {
    const wave = Math.min(12, h * 0.18);
    const d = `M${round(x)},${round(y)} H${round(x + w)} V${round(y + h - wave)} C${round(x + w * 0.72)},${round(y + h + wave * 1.6)} ${round(x + w * 0.28)},${round(y + h - wave * 2.6)} ${round(x)},${round(y + h - wave)} Z`;
    return `<path d="${d}" ${attrs ?? ""}/>`;
  }
  if (kind === "note") {
    const fold = Math.min(16, w * 0.18, h * 0.32);
    const d = `M${round(x)},${round(y)} H${round(x + w - fold)} L${round(x + w)},${round(y + fold)} V${round(y + h)} H${round(x)} Z`;
    return `<path d="${d}" ${attrs ?? ""}/>`;
  }
  const radius = kind === "terminal" ? h / 2 : theme.node.radius;
  return `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${round(radius)}" ${attrs ?? ""}/>`;
}
