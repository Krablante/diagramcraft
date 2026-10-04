// Layout: spec + theme -> geometry model. ELK's layered algorithm does the
// graph layout and orthogonal edge routing.
// @ts-check
import ELK from "elkjs/lib/elk.bundled.js";
import { blockHeight, measureText, widestLine, wrapText } from "./text.js";
import { snapToBorder } from "./shapes.js";

/** @typedef {import("./types.js").Spec} Spec */
/** @typedef {import("./types.js").Theme} Theme */
/** @typedef {import("./types.js").Model} Model */
/** @typedef {import("./types.js").ModelNode} ModelNode */

const elk = new (/** @type {any} */ (ELK))();

/** @type {Record<string, string>} */
const ELK_DIRECTIONS = { TB: "DOWN", LR: "RIGHT", RL: "LEFT", BT: "UP" };

/**
 * @param {import("./types.js").SpecNode} node
 * @param {Theme} theme
 */
function sizeNode(node, theme) {
  const kind = theme.node.kinds?.[node.kind] ?? {};
  const nodeFont = theme.fonts.node;
  const noteFont = theme.fonts.note;
  const padX = theme.node.padX;
  const padY = theme.node.padY;

  if (node.kind === "junction" || node.kind === "connector") {
    const size = node.width ?? kind.size ?? (node.kind === "junction" ? 12 : 44);
    const lines = node.kind === "connector" ? wrapText(node.label, nodeFont, node.maxWidth ?? theme.node.maxTextWidth) : [];
    const noteLines = node.kind === "connector" && node.note ? wrapText(node.note, noteFont, node.maxWidth ?? theme.node.maxTextWidth) : [];
    const diameter = node.kind === "junction" ? size : Math.max(size, widestLine(lines, nodeFont) + 16, widestLine(noteLines, noteFont) + 16,
      blockHeight(lines, nodeFont) + blockHeight(noteLines, noteFont) + (noteLines.length ? 5 : 0) + 16);
    return { lines, noteLines, labelFont: nodeFont, w: node.width ?? diameter, h: node.height ?? diameter };
  }

  const maxTextWidth = node.maxWidth ?? theme.node.maxTextWidth;
  const wrapWidth = node.kind === "decision" ? maxTextWidth * 0.72 : node.kind === "data" ? maxTextWidth * 0.9 : maxTextWidth;
  const lines = wrapText(node.label, nodeFont, wrapWidth);
  const noteLines = node.note ? wrapText(node.note, noteFont, wrapWidth + 30) : [];

  let w = Math.max(theme.node.minWidth, widestLine(lines, nodeFont), noteLines.length ? widestLine(noteLines, noteFont) : 0) + padX * 2;
  if (node.kind === "decision") w = Math.round(w * 1.28);
  if (node.kind === "data") w = Math.round(w * 1.14);
  let h = padY * 2 + blockHeight(lines, nodeFont) + (noteLines.length ? 5 + blockHeight(noteLines, noteFont) : 0);
  if (node.kind === "decision") {
    // A diamond narrows towards its top and bottom. Fit each text line's
    // bounds inside those slopes instead of treating it as a rectangle.
    const textHeight = h - padY * 2;
    let cursor = -textHeight / 2;
    let requiredHeight = h * 1.16;
    for (const { textLines, font } of [{ textLines: lines, font: nodeFont }, { textLines: noteLines, font: noteFont }]) {
      if (textLines === noteLines && noteLines.length) cursor += 5;
      const lineHeight = (font.lineHeight ?? 1.35) * font.size;
      for (const line of textLines) {
        const extentY = Math.abs(cursor + lineHeight / 2) + lineHeight / 2 + padY / 2;
        const fractionX = (measureText(line, font) + padX) / w;
        requiredHeight = Math.max(requiredHeight, 2 * extentY / (1 - fractionX));
        cursor += lineHeight;
      }
    }
    h = Math.ceil(requiredHeight);
  }
  if (node.kind === "database") h += 22; // Keep text below the cylinder's top cap.
  if (node.kind === "document") h += 18; // Reserve the wave below the text block.

  return {
    lines,
    noteLines,
    labelFont: nodeFont,
    w: node.width ?? Math.round(w),
    h: node.height ?? Math.round(h),
  };
}

/**
 * Lay out a spec with a resolved theme.
 * ASCII rendering passes overrides so the layout happens in character-cell
 * space instead of pixel space.
 * @param {Spec} spec
 * @param {Theme} theme
 * @param {{
 *   nodeSize?: (node: import("./types.js").SpecNode) => {lines:string[], noteLines:string[], labelFont:any, w:number, h:number},
 *   edgeLabelSize?: (edge: import("./types.js").SpecEdge) => {w:number, h:number},
 *   spacing?: {nodeGap?:number, rankGap?:number, edgeGap?:number},
 * }} [options]
 * @returns {Promise<Model>}
 */
export async function layoutSpec(spec, theme, options = {}) {
  const sized = spec.nodes.map((node) => ({ node, size: options.nodeSize ? options.nodeSize(node) : sizeNode(node, theme) }));

  const children = sized.map(({ node, size }) => ({ id: node.id, width: size.w, height: size.h }));
  const edgeFont = theme.fonts.edge;
  const labelPadX = theme.edge.label.padX ?? 5;
  const labelPadY = theme.edge.label.padY ?? 2;
  const edges = spec.edges.map((edge) => {
    /** @type {any} */
    const elkEdge = { id: edge.id, sources: [edge.from], targets: [edge.to] };
    if (edge.label) {
      if (options.edgeLabelSize) {
        const size = options.edgeLabelSize(edge);
        elkEdge.labels = [{ text: edge.label, width: Math.round(size.w), height: Math.round(size.h) }];
      } else {
        const textWidth = measureText(edge.label, edgeFont);
        elkEdge.labels = [{ text: edge.label, width: Math.round(textWidth + labelPadX * 2), height: Math.round(edgeFont.size * 1.35 + labelPadY * 2) }];
      }
    }
    return elkEdge;
  });

  const layout = { ...theme.layout, ...spec.layout, ...options.spacing };
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": ELK_DIRECTIONS[spec.direction] ?? "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": String(layout.nodeGap),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(layout.rankGap),
      "elk.spacing.edgeNode": String(layout.edgeGap),
      "elk.layered.spacing.edgeNodeBetweenLayers": String(Math.max(24, layout.edgeGap)),
      "elk.spacing.edgeEdge": "12",
      "elk.layered.spacing.edgeLabel": String(layout.edgeLabelGap ?? 8),
      "elk.layered.unnecessaryBendpoints": "true",
      "elk.layered.mergeEdges": "false",
      "elk.layered.feedbackEdges": "true",
      "elk.layered.cycleBreaking.strategy": "DEPTH_FIRST",
      "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
    },
    children,
    edges,
  };

  const result = await elk.layout(graph);

  /** @type {ModelNode[]} */
  const nodes = [];
  const sizeById = new Map(sized.map(({ node, size }) => [node.id, { node, size }]));
  for (const child of result.children ?? []) {
    const entry = sizeById.get(child.id);
    if (!entry) continue;
    nodes.push({
      id: entry.node.id,
      kind: entry.node.kind,
      labelFont: entry.size.labelFont,
      lines: entry.size.lines,
      noteLines: entry.size.noteLines,
      accent: entry.node.accent,
      color: entry.node.color,
      x: child.x ?? 0,
      y: child.y ?? 0,
      w: child.width ?? entry.size.w,
      h: child.height ?? entry.size.h,
    });
  }

  /** @type {import("./types.js").ModelEdge[]} */
  const edgesOut = [];
  const edgeById = new Map(spec.edges.map((edge) => [edge.id, edge]));
  for (const elkEdge of result.edges ?? []) {
    const specEdge = edgeById.get(elkEdge.id);
    if (!specEdge) continue;
    /** @type {number[][][]} */
    const paths = (elkEdge.sections ?? []).map((section) => [
      [section.startPoint.x, section.startPoint.y],
      ...(section.bendPoints ?? []).map((point) => [point.x, point.y]),
      [section.endPoint.x, section.endPoint.y],
    ]);
    const label = (elkEdge.labels ?? [])[0];
    edgesOut.push({
      id: specEdge.id,
      from: specEdge.from,
      to: specEdge.to,
      kind: specEdge.kind,
      arrow: specEdge.arrow,
      color: specEdge.color,
      label: specEdge.label,
      paths,
      labelBox: label && typeof label.x === "number" ? { x: label.x, y: label.y, w: label.width ?? 0, h: label.height ?? 0 } : null,
    });
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  // Zones hug their members: a thin vertical pad, a left gutter wide enough
  // for the group label, and padding on the other sides.
  const zoneLabelFont = theme.fonts.zone;
  const rawZones = spec.groups
    .map((group) => {
      const members = group.nodes.map((id) => nodeById.get(id)).filter(Boolean);
      if (!members.length) return null;
      const labelText = zoneLabelFont.uppercase ? group.label.toUpperCase() : group.label;
      const labelWidth = measureText(labelText, zoneLabelFont);
      const padX = theme.zone.pad;
      const padY = theme.zone.padY ?? Math.max(8, Math.round(padX * 0.5));
      const gutter = Math.max(padX, Math.ceil(labelWidth) + theme.zone.labelPad + 6);
      const x = Math.min(...members.map((member) => member.x)) - gutter;
      const y = Math.min(...members.map((member) => member.y)) - padY;
      const right = Math.max(...members.map((member) => member.x + member.w)) + padX;
      const bottom = Math.max(...members.map((member) => member.y + member.h)) + padY;
      return { id: group.id, label: group.label, color: group.color, x, y, w: right - x, h: bottom - y };
    })
    .filter((zone) => zone !== null);

  // Snap edge endpoints to the real shape borders so arrowheads land on the
  // outline rather than on the rectangular layout box.
  for (const edge of edgesOut) {
    const source = nodeById.get(edge.from);
    const target = nodeById.get(edge.to);
    if (!source || !target) continue;
    for (let i = 0; i < edge.paths.length; i++) {
      const path = edge.paths[i];
      if (path.length < 2) continue;
      if (i === 0) {
        const snapped = snapToBorder(source, theme, path[0], path[1]);
        if (edge.arrow === "both") {
          const dx = path[1][0] - snapped[0];
          const dy = path[1][1] - snapped[1];
          if (Math.abs(dx) >= Math.abs(dy)) snapped[0] += Math.sign(dx || 1);
          else snapped[1] += Math.sign(dy || 1);
        }
        path[0] = snapped;
      }
      if (i === edge.paths.length - 1) {
        const last = path.length - 1;
        const snapped = snapToBorder(target, theme, path[last], path[last - 1]);
        const gap = edge.arrow !== "none" && target.kind !== "junction" ? 1 : 0;
        if (gap) {
          const dx = snapped[0] - path[last - 1][0];
          const dy = snapped[1] - path[last - 1][1];
          if (Math.abs(dx) >= Math.abs(dy)) snapped[0] -= Math.sign(dx || 1) * gap;
          else snapped[1] -= Math.sign(dy || 1) * gap;
        }
        path[last] = snapped;
      }
    }
  }

  // Shift everything so the model starts at (0,0), then measure total bounds.
  let minX = Infinity;
  let minY = Infinity;
  const consider = (/** @type {number} */ x, /** @type {number} */ y) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
  };
  for (const node of nodes) consider(node.x, node.y);
  for (const edge of edgesOut) {
    for (const path of edge.paths) for (const [x, y] of path) consider(x, y);
    if (edge.labelBox) consider(edge.labelBox.x, edge.labelBox.y);
  }
  for (const zone of rawZones) consider(zone.x, zone.y);
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
  }

  let width = 0;
  let height = 0;
  const grow = (/** @type {number} */ x, /** @type {number} */ y) => {
    width = Math.max(width, x);
    height = Math.max(height, y);
  };
  for (const node of nodes) {
    node.x -= minX;
    node.y -= minY;
    grow(node.x + node.w, node.y + node.h);
  }
  for (const edge of edgesOut) {
    for (const path of edge.paths) {
      for (const point of path) {
        point[0] -= minX;
        point[1] -= minY;
        grow(point[0], point[1]);
      }
    }
    if (edge.labelBox) {
      edge.labelBox.x -= minX;
      edge.labelBox.y -= minY;
      grow(edge.labelBox.x + edge.labelBox.w, edge.labelBox.y + edge.labelBox.h);
    }
  }
  for (const zone of rawZones) {
    zone.x -= minX;
    zone.y -= minY;
    grow(zone.x + zone.w, zone.y + zone.h);
  }
  const zones = rawZones;

  return { width: Math.ceil(width), height: Math.ceil(height), nodes, edges: edgesOut, zones };
}
