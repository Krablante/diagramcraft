// SVG renderer: geometry model + theme -> self-contained SVG string.
// @ts-check
import { blockHeight, widestLine } from "./text.js";
import { deepMerge, escapeXml, round } from "./util.js";
import { shapePath } from "./shapes.js";

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
    if (!paint || paint.type === "solid" || !paint.type) return escapeXml(paint?.color ?? "none");
    const key = JSON.stringify(paint);
    return `url(#${define(key, (id) => gradientBody(paint, id))})`;
  };

  /** @param {Paint} paint */
  function gradientBody(paint, id) {
    const stops = (paint.stops ?? [])
      .map(([offset, color]) => `<stop offset="${round(offset, 3)}" stop-color="${escapeXml(color)}"/>`)
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

  /**
   * Shadow/glow-only filter. It renders no source graphic, so nodes can drop
   * their shadows behind edges without washing out arrowheads.
   * @param {object|null} shadow @param {object|null} glow
   */
  function shadowFilter(shadow, glow) {
    if (!shadow && !glow) return "";
    const parts = [];
    const merges = [];
    if (shadow) {
      parts.push(`<feGaussianBlur in="SourceAlpha" stdDeviation="${round(shadow.blur)}" result="shadowBlur"/>`);
      parts.push(`<feOffset in="shadowBlur" dx="${round(shadow.x ?? 0)}" dy="${round(shadow.y)}" result="shadowOffset"/>`);
      parts.push(`<feFlood flood-color="${escapeXml(shadow.color)}" flood-opacity="${round(shadow.opacity)}" result="shadowColor"/>`);
      parts.push(`<feComposite in="shadowColor" in2="shadowOffset" operator="in" result="shadowOut"/>`);
      merges.push(`<feMergeNode in="shadowOut"/>`);
    }
    if (glow) {
      parts.push(`<feGaussianBlur in="SourceAlpha" stdDeviation="${round(glow.blur)}" result="glowBlur"/>`);
      parts.push(`<feFlood flood-color="${escapeXml(glow.color)}" flood-opacity="${round(glow.opacity ?? 0.6)}" result="glowColor"/>`);
      parts.push(`<feComposite in="glowColor" in2="glowBlur" operator="in" result="glowOut"/>`);
      merges.push(`<feMergeNode in="glowOut"/>`);
    }
    return `<filter x="-60%" y="-80%" width="220%" height="280%">${parts.join("")}<feMerge>${merges.join("")}</feMerge></filter>`;
  }

  const pad = theme.canvas.padding;
  const titleFont = theme.fonts.title;
  const subtitleFont = theme.fonts.subtitle;
  const footerFont = theme.fonts.footer;

  const titleLines = spec.title ? wrapNo(spec.title) : [];
  const subtitleLines = spec.subtitle ? wrapNo(spec.subtitle) : [];
  const footerLines = spec.footer ? wrapNo(spec.footer) : [];

  const titleWidth = Math.max(titleLines.length ? widestLine(titleLines, titleFont) : 0, subtitleLines.length ? widestLine(subtitleLines, subtitleFont) : 0);
  const contentWidth = Math.max(model.width, theme.canvas.minWidth, titleWidth, widestLine(footerLines, footerFont));
  const width = Math.ceil(contentWidth + pad * 2);
  const ruleHeight = titleLines.length && theme.heading.rule ? (theme.heading.rule.gap ?? 8) + (theme.heading.rule.width ?? 3) : 0;
  const titleBlockHeight = titleLines.length || subtitleLines.length ? blockHeight(titleLines, titleFont) + ruleHeight + (subtitleLines.length ? (titleLines.length ? theme.heading.subtitleGap : 0) + blockHeight(subtitleLines, subtitleFont) : 0) + theme.heading.gap : 0;
  const footerBlockHeight = footerLines.length ? theme.footer.gap + blockHeight(footerLines, footerFont) : 0;
  const height = Math.ceil(titleBlockHeight + model.height + footerBlockHeight + pad * 2);
  const originX = pad;
  const originY = pad + titleBlockHeight;

  /** @type {string[]} */
  const layers = [];
  // A shared backdrop supplies vector lenses; it never contains text or edges.
  // Reusing it avoids a canvas-sized blur/displacement filter for every node.
  const backdrop = [];

  // ---- canvas background -------------------------------------------------
  if (!options.transparent) {
    /** @type {string[]} */
    const bgLayers = [];
    const bg = paintValue(theme.canvas.background);
    bgLayers.push(`<rect width="${width}" height="${height}" fill="${bg}"/>`);
    for (const blob of theme.canvas.blobs ?? []) {
      const id = define(
        `blob:${JSON.stringify(blob)}`,
        (defId) => `<radialGradient id="${defId}" cx="${round(blob.cx, 3)}" cy="${round(blob.cy, 3)}" r="${round(blob.r, 3)}"><stop offset="0" stop-color="${escapeXml(blob.color)}" stop-opacity="${round(blob.opacity ?? 1)}"/><stop offset="1" stop-color="${escapeXml(blob.color)}" stop-opacity="0"/></radialGradient>`,
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
        (defId) => `<radialGradient id="${defId}" cx="0.5" cy="0.5" r="${round(v.size ?? 0.72, 3)}"><stop offset="0.45" stop-color="${escapeXml(v.color)}" stop-opacity="0"/><stop offset="1" stop-color="${escapeXml(v.color)}" stop-opacity="${round(v.opacity)}"/></radialGradient>`,
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
    backdrop.push(...bgLayers);
  }

  /** @param {any} texture @param {string} id */
  function textureBody(texture, id) {
    if (texture.type === "noise") {
      const frequency = round(0.85 * (texture.scale ?? 1), 3);
      return `<filter id="${id}f" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="3" seed="${round(texture.seed ?? 7)}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${round(texture.opacity ?? 0.05, 4)} 0"/></filter><pattern id="${id}" width="180" height="180" patternUnits="userSpaceOnUse"><rect width="180" height="180" filter="url(#${id}f)"/></pattern>`;
    }
    if (texture.type === "grid") {
      const size = round(texture.size ?? 24);
      const stroke = escapeXml(texture.color ?? "rgba(0,0,0,0.06)");
      return `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><path d="M ${size} 0 H 0 V ${size}" fill="none" stroke="${stroke}" stroke-width="${round(texture.width ?? 1)}"/></pattern>`;
    }
    if (texture.type === "dots") {
      const size = round(texture.size ?? 22);
      const stroke = escapeXml(texture.color ?? "rgba(0,0,0,0.12)");
      const radius = round(texture.radius ?? 1.1);
      return `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="${stroke}"/></pattern>`;
    }
    if (texture.type === "contours") {
      const size = texture.size ?? 96;
      const paths = [size / 4, size * 3 / 4].map(y => `M${round(-size)},${round(y)} C${round(-size / 2)},${round(y - size / 3)} ${round(-size / 2)},${round(y + size / 3)} 0,${round(y)} S${round(size / 2)},${round(y - size / 3)} ${round(size)},${round(y)} S${round(size * 1.5)},${round(y + size / 3)} ${round(size * 2)},${round(y)} S${round(size * 2.5)},${round(y - size / 3)} ${round(size * 3)},${round(y)}`);
      return `<pattern id="${id}" width="${round(size * 2)}" height="${round(size)}" patternUnits="userSpaceOnUse"><path d="${paths.join(" ")}" fill="none" stroke="${escapeXml(texture.color ?? "rgba(0,0,0,0.08)")}" stroke-width="${round(texture.width ?? 1)}"/></pattern>`;
    }
    throw new Error(`unknown texture type ${JSON.stringify(texture.type)}`);
  }

  // ---- zones ---------------------------------------------------------------
  const zoneFont = { ...theme.fonts.zone };
  const zoneLabels = [];
  for (const zone of model.zones) {
    const stroke = theme.zone.stroke ?? {};
    const zoneFill = zone.color ? { type: "solid", color: zone.color } : theme.zone.fill;
    const dash = stroke.dash ? ` stroke-dasharray="${escapeXml(stroke.dash.join(" "))}"` : "";
    const zx = zone.x + originX;
    const zy = zone.y + originY;
    const zoneRect = `<rect x="${round(zx)}" y="${round(zy)}" width="${round(zone.w)}" height="${round(zone.h)}" rx="${round(theme.zone.radius)}" fill="${paintValue(zoneFill)}" stroke="${escapeXml(stroke.color ?? "none")}" stroke-width="${round(stroke.width ?? 0)}"${dash}/>`;
    layers.push(`<g>${zoneRect}`);
    if (backdrop.length) backdrop.push(zoneRect);
    const label = zoneFont.uppercase ? zone.label.toUpperCase() : zone.label;
    const labelColor = theme.zone.labelColor ?? zoneFont.color;
    const labelX = zx + theme.zone.labelPad;
    const labelY = zy + theme.zone.labelPad;
    const labelHeight = (zoneFont.lineHeight ?? 1.35) * zoneFont.size;
    zoneLabels.push(
      `<rect x="${round(labelX - 3)}" y="${round(labelY - labelHeight / 2)}" width="${round(widestLine([label], zoneFont) + 6)}" height="${round(labelHeight)}" fill="${paintValue(theme.zone.labelFill ?? zoneFill)}"/>`,
      textLine(label, { ...zoneFont, color: labelColor }, labelX, labelY, "start"),
    );
    layers.push(`</g>`);
  }

  /** @param {any} node */
  function resolveNodeStyle(node) {
    const kindTokens = theme.node.kinds?.[node.kind] ?? {};
    let fill = kindTokens.fill ?? theme.node.fill;
    let stroke = deepMerge(theme.node.stroke, kindTokens.stroke ?? {});
    const shadow = "shadow" in kindTokens ? kindTokens.shadow : theme.node.shadow;
    const glow = "glow" in kindTokens ? kindTokens.glow : theme.node.glow;
    const glass = "glass" in kindTokens ? kindTokens.glass : theme.node.glass;
    let textColor = node.labelFont.color ?? theme.fonts.node.color;
    if (node.accent) {
      fill = theme.node.accent.fill ?? fill;
      stroke = deepMerge(stroke, theme.node.accent.stroke ?? {});
      textColor = theme.node.accent.text?.color ?? textColor;
    }
    if (node.color) fill = { type: "solid", color: node.color };
    return { fill, stroke, shadow, glow, glass, textColor };
  }

  // Node shadows and glows render behind the edges so arrowheads stay crisp.
  for (const node of model.nodes) {
    const style = resolveNodeStyle(node);
    if (!style.shadow && !style.glow) continue;
    const filterId = themeFilter(shadowFilter(style.shadow, style.glow));
    if (!filterId) continue;
    const x = node.x + originX;
    const y = node.y + originY;
    layers.push(`<g data-shadow="${escapeXml(node.id)}" filter="url(#${filterId})">${shapePath(node.kind, x, y, node.w, node.h, theme, 'fill="#000000" stroke="none"')}</g>`);
  }

  // ---- edges ---------------------------------------------------------------
  const kindById = new Map(model.nodes.map((node) => [node.id, node.kind]));
  for (const edge of model.edges) {
    const kindStyle = theme.edge.kinds?.[edge.kind] ?? {};
    const strokeStyle = deepMerge(theme.edge.stroke, kindStyle);
    const color = escapeXml(edge.color ?? strokeStyle.color);
    const dash = strokeStyle.dash ? ` stroke-dasharray="${escapeXml(strokeStyle.dash.join(" "))}"` : "";
    const arrowColor = escapeXml(edge.color ?? theme.edge.arrow.color ?? strokeStyle.color);
    const arrowKey = `arrow:${theme.edge.arrow.type}:${arrowColor}:${theme.edge.arrow.size}:${strokeStyle.width}`;
    const markerId = theme.edge.arrow.type === "none" ? null : define(arrowKey, (defId) => markerBody(theme.edge.arrow, arrowColor, defId, strokeStyle.width));
    const startMarkerId = edge.arrow === "both" && theme.edge.arrow.type !== "none" ? define(`${arrowKey}:start`, (defId) => markerBody(theme.edge.arrow, arrowColor, defId, strokeStyle.width, true)) : null;
    for (let i = 0; i < edge.paths.length; i++) {
      const last = i === edge.paths.length - 1;
      const points = cleanPoints(edge.paths[i]).map(([x, y]) => [x + originX, y + originY]);
      const d = roundedPath(points, theme.edge.cornerRadius ?? 0);
      const startMarker = startMarkerId && i === 0 && kindById.get(edge.from) !== "junction" ? ` marker-start="url(#${startMarkerId})"` : "";
      const intoJunction = kindById.get(edge.to) === "junction";
      const endMarker = edge.arrow !== "none" && last && markerId && !intoJunction ? ` marker-end="url(#${markerId})"` : "";
      layers.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${round(strokeStyle.width)}" stroke-linecap="round" stroke-linejoin="round"${dash}${startMarker}${endMarker}/>`);
    }
  }

  /**
   * Arrow markers use orient="auto" only: resvg (and some other renderers)
   * mishandle the SVG 2 "auto-start-reverse" value, which produced sideways
   * arrowheads. Start arrows are a mirrored marker instead.
   * @param {any} arrow @param {string} color @param {string} id @param {number} strokeWidth @param {boolean} [start]
   */
  function markerBody(arrow, color, id, strokeWidth, start = false) {
    const size = (arrow.size ?? 9) * (0.92 + Math.min(strokeWidth, 2.4) * 0.08);
    const tip = start ? 0.6 : 9.4;
    const base = start ? 9.4 : 0.9;
    if (arrow.type === "vee") {
      const veeTip = start ? 0.8 : 9.2;
      const veeBase = start ? 9.2 : 0.8;
      return `<marker id="${id}" markerUnits="userSpaceOnUse" viewBox="0 0 10 10" refX="${veeTip}" refY="5" markerWidth="${round(size)}" markerHeight="${round(size)}" orient="auto"><path d="M${veeBase},0.8 L${veeTip},5 L${veeBase},9.2" fill="none" stroke="${color}" stroke-width="${round(Math.max(1.1, strokeWidth * 0.85))}" stroke-linecap="round" stroke-linejoin="round"/></marker>`;
    }
    if (arrow.type === "circle") {
      return `<marker id="${id}" markerUnits="userSpaceOnUse" viewBox="0 0 10 10" refX="5.4" refY="5" markerWidth="${round(size * 0.8)}" markerHeight="${round(size * 0.8)}" orient="auto"><circle cx="5.4" cy="5" r="4.2" fill="${color}"/></marker>`;
    }
    return `<marker id="${id}" markerUnits="userSpaceOnUse" viewBox="0 0 10 10" refX="${tip}" refY="5" markerWidth="${round(size)}" markerHeight="${round(size)}" orient="auto"><path d="M${base},0.8 L${tip},5 L${base},9.2 Z" fill="${color}"/></marker>`;
  }

  // Label backgrounds keep crossing routes from cutting through group names.
  layers.push(...zoneLabels);

  // edge labels above edges, below nodes
  for (const edge of model.edges) {
    if (!edge.label || !edge.labelBox) continue;
    const font = theme.fonts.edge;
    const box = edge.labelBox;
    const x = box.x + originX;
    const y = box.y + originY;
    const fill = theme.edge.label.fill;
    const radius = theme.edge.label.radius ?? 4;
    if (fill && fill !== "none") layers.push(`<rect x="${round(x + 1)}" y="${round(y + 1)}" width="${round(box.w - 2)}" height="${round(box.h - 2)}" rx="${round(radius)}" fill="${escapeXml(fill)}"/>`);
    layers.push(textLine(edge.label, font, x + box.w / 2, y + box.h / 2, "middle"));
  }

  // ---- nodes ---------------------------------------------------------------
  for (const node of model.nodes) {
    const { fill, stroke, glass, textColor } = resolveNodeStyle(node);
    const x = node.x + originX;
    const y = node.y + originY;
    const dash = stroke.dash ? ` stroke-dasharray="${escapeXml(stroke.dash.join(" "))}"` : "";
    const common = `fill="${paintValue(fill)}" stroke="${escapeXml(stroke.color ?? "none")}" stroke-width="${round(stroke.width ?? 0)}"${dash}`;
    const group = [`<g data-node="${escapeXml(node.id)}">`];

    if (glass) {
      const clipId = define(`lens:${node.id}`, (id) => `<clipPath id="${id}">${shapePath(node.kind, x, y, node.w, node.h, theme, 'fill="#ffffff" stroke="none"')}</clipPath>`);
      if (backdrop.length) {
        const backdropId = define("backdrop", (id) => `<g id="${id}">${backdrop.join("")}</g>`);
        const zoom = glass.refraction ?? 1.14;
        const cx = x + node.w / 2;
        const cy = y + node.h / 2;
        const edgeZoom = glass.edgeRefraction ?? zoom;
        const inset = Math.min((glass.bevelWidth ?? 6) / 2, node.w / 4, node.h / 4);
        // Pattern viewports bound native raster work to this node's rectangle.
        // Direct clipped canvas-sized <use> layers allocate full-canvas masks.
        const lens = (factor) => {
          const id = define(`lens-paint:${node.id}:${factor}`, (defId) => `<pattern id="${defId}" x="${round(x)}" y="${round(y)}" width="${round(node.w)}" height="${round(node.h)}" patternUnits="userSpaceOnUse" viewBox="${round(x)} ${round(y)} ${round(node.w)} ${round(node.h)}" preserveAspectRatio="none"><use href="#${backdropId}" transform="translate(${round(cx * (1 - factor))} ${round(cy * (1 - factor))}) scale(${round(factor)})"/></pattern>`);
          return `fill="url(#${id})" stroke="none"`;
        };
        let centre = "";
        if (edgeZoom !== zoom && inset > 0) {
          centre = shapePath(node.kind, x + inset, y + inset, node.w - inset * 2, node.h - inset * 2, theme, lens(zoom));
        }
        group.push(`<g data-lens="${escapeXml(node.id)}">${shapePath(node.kind, x, y, node.w, node.h, theme, lens(edgeZoom))}${centre}</g>`);
      }
      // Both the bevel and its directional rim sit inside the real outline.
      // The node's normal paint is a translucent tint over the refracted view.
      group.push(shapePath(node.kind, x, y, node.w, node.h, theme, common));
      const bevel = `fill="none" stroke="${paintValue(glass.bevel)}" stroke-width="${round(glass.bevelWidth ?? 6)}"`;
      const rim = `fill="none" stroke="${paintValue(glass.rim)}" stroke-width="${round(glass.rimWidth ?? 1.5)}"`;
      group.push(`<g data-glass="${escapeXml(node.id)}" clip-path="url(#${clipId})">${shapePath(node.kind, x, y, node.w, node.h, theme, bevel)}${shapePath(node.kind, x, y, node.w, node.h, theme, rim)}</g>`);
    } else {
      group.push(shapePath(node.kind, x, y, node.w, node.h, theme, common));
    }
    if (node.kind === "database") {
      const ry = Math.min(11, node.h * 0.2);
      const cx = x + node.w / 2;
      group.push(`<ellipse cx="${round(cx)}" cy="${round(y + ry)}" rx="${round(node.w / 2)}" ry="${round(ry)}" ${common}/>`);
    } else if (node.kind === "note") {
      const fold = Math.min(16, node.w * 0.18, node.h * 0.32);
      group.push(`<path d="M${round(x + node.w - fold)},${round(y)} V${round(y + fold)} H${round(x + node.w)}" fill="none" stroke="${escapeXml(stroke.color ?? "none")}" stroke-width="${round(stroke.width ?? 0)}"/>`);
    }

    if (theme.node.shine) {
      const shineId = define(`shine:${JSON.stringify(theme.node.shine)}`, (defId) => gradientBody(theme.node.shine, defId));
      group.push(shapePath(node.kind, x, y, node.w, node.h, theme, `fill="url(#${shineId})" stroke="none"`));
    }

    const lineHeight = (node.labelFont.lineHeight ?? 1.35) * node.labelFont.size;
    const noteFont = node.accent ? { ...theme.fonts.note, color: theme.node.accent.note?.color ?? textColor } : theme.fonts.note;
    const noteHeight = node.noteLines.length ? 5 + blockHeight(node.noteLines, noteFont) : 0;
    const totalHeight = blockHeight(node.lines, node.labelFont) + noteHeight;
    let cursor = y + (node.h - totalHeight) / 2 + (node.kind === "database" ? Math.min(11, node.h * 0.2) / 2 : 0);
    if (node.kind === "document") cursor -= Math.min(12, node.h * 0.18) / 2;
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
  if (titleLines.length || subtitleLines.length) {
    const align = theme.heading.align ?? "left";
    const x = align === "center" ? width / 2 : align === "right" ? width - pad : pad;
    const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
    let cursor = pad;
    const titleHeight = blockHeight(titleLines, titleFont);
    for (let i = 0; i < titleLines.length; i++) layers.push(textLine(titleLines[i], titleFont, x, cursor + (i + 0.5) * (titleFont.lineHeight ?? 1.35) * titleFont.size, anchor));
    cursor += titleHeight;
    if (titleLines.length && theme.heading.rule) {
      const rule = theme.heading.rule;
      cursor += rule.gap ?? 8;
      const ruleX = align === "center" ? x - (rule.length ?? 56) / 2 : align === "right" ? x - (rule.length ?? 56) : x;
      layers.push(`<rect x="${round(ruleX)}" y="${round(cursor)}" width="${round(rule.length ?? 56)}" height="${round(rule.width ?? 3)}" rx="${(rule.width ?? 3) / 2}" fill="${escapeXml(rule.color)}"/>`);
      cursor += (rule.width ?? 3);
    }
    if (subtitleLines.length) {
      if (titleLines.length) cursor += theme.heading.subtitleGap;
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
      `font-weight="${round(font.weight ?? 400)}"`,
      `fill="${escapeXml(font.color)}"`,
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
    // Leave at least a short straight run on both sides of the corner so tiny
    // stubs do not turn into hooks.
    const r = Math.min(radius, Math.max(0, inLength * 0.5 - 0.75), Math.max(0, outLength * 0.5 - 0.75));
    if (r < 0.75) {
      d += ` L${round(x)},${round(y)}`;
      continue;
    }
    const a = [x + ((px - x) / inLength) * r, y + ((py - y) / inLength) * r];
    const b = [x + ((nx - x) / outLength) * r, y + ((ny - y) / outLength) * r];
    d += ` L${round(a[0])},${round(a[1])} Q${round(x)},${round(y)} ${round(b[0])},${round(b[1])}`;
  }
  const last = rounded[rounded.length - 1];
  d += ` L${last[0]},${last[1]}`;
  return d;
}

/**
 * Remove duplicate, collinear and tiny jog points so corner rounding only
 * ever sees intentional turns.
 * @param {number[][]} raw
 * @returns {number[][]}
 */
export function cleanPoints(raw) {
  /** @type {number[][]} */
  const pts = [];
  for (const [x0, y0] of raw) {
    const x = round(x0, 2);
    const y = round(y0, 2);
    const last = pts[pts.length - 1];
    if (last && Math.abs(last[0] - x) < 0.5 && Math.abs(last[1] - y) < 0.5) continue;
    pts.push([x, y]);
  }
  if (pts.length < 3) return pts;

  /** @type {number[][]} */
  const merged = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = merged[merged.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const cross = Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]));
    const forward = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) > 0;
    if (cross < 0.5 && forward) continue;
    merged.push(b);
  }
  merged.push(pts[pts.length - 1]);

  // Collapse short offset jogs: a -> b -> c -> d where a->b and c->d are
  // parallel and the connector b->c is a small perpendicular step.
  let result = merged;
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let i = 0; i + 3 < result.length; i++) {
      const [a, b, c, d] = [result[i], result[i + 1], result[i + 2], result[i + 3]];
      const horizontal = Math.abs(a[1] - b[1]) < 0.5 && Math.abs(c[1] - d[1]) < 0.5 && Math.abs(b[0] - c[0]) < 0.5 && Math.abs(b[1] - c[1]) > 0.5 && Math.abs(b[1] - c[1]) <= 14;
      const vertical = Math.abs(a[0] - b[0]) < 0.5 && Math.abs(c[0] - d[0]) < 0.5 && Math.abs(b[1] - c[1]) < 0.5 && Math.abs(b[0] - c[0]) > 0.5 && Math.abs(b[0] - c[0]) <= 14;
      if (!horizontal && !vertical) continue;
      if (horizontal) {
        const mid = (b[1] + c[1]) / 2;
        result[i + 1] = [b[0], mid];
        result[i + 2] = [c[0], mid];
      } else {
        const mid = (b[0] + c[0]) / 2;
        result[i + 1] = [mid, b[1]];
        result[i + 2] = [mid, c[1]];
      }
      changed = true;
    }
    if (!changed) break;
    /** @type {number[][]} */
    const next = [result[0]];
    for (let i = 1; i < result.length - 1; i++) {
      const a = next[next.length - 1];
      const b = result[i];
      const c = result[i + 1];
      const cross = Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]));
      const forward = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) > 0;
      if (cross < 0.5 && forward) continue;
      if (Math.abs(b[0] - a[0]) < 0.5 && Math.abs(b[1] - a[1]) < 0.5) continue;
      next.push(b);
    }
    next.push(result[result.length - 1]);
    result = next;
  }
  return result;
}
