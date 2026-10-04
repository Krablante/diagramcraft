// Spec parsing and validation. The spec is the editable source of truth:
// every output format renders from it.
// @ts-check

/** @typedef {import("./types.js").Spec} Spec */
/** @typedef {import("./types.js").SpecIssue} SpecIssue */
/** @typedef {import("./types.js").NodeKind} NodeKind */

export const NODE_KINDS = /** @type {NodeKind[]} */ ([
  "terminal",
  "process",
  "decision",
  "data",
  "document",
  "database",
  "connector",
  "note",
  "junction",
]);

export const EDGE_KINDS = ["solid", "dashed", "dotted"];
export const ARROW_KINDS = ["end", "both", "none"];
export const DIRECTIONS = ["TB", "LR", "RL", "BT"];
export const OUTPUT_FORMATS = ["svg", "png", "ascii"];

export class SpecError extends Error {
  /** @param {SpecIssue[]} issues */
  constructor(issues) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "SpecError";
    /** @type {SpecIssue[]} */
    this.issues = issues;
  }
}

/** @param {unknown} value */
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Report fields the spec does not define, so typos fail with a path instead
 * of passing silently. Mirrors `additionalProperties: false` in the published
 * JSON Schema.
 * @param {Record<string, any>} value
 * @param {string[]} allowed
 * @param {string} path
 * @param {(path:string, message:string) => void} problem
 */
function rejectUnknown(value, allowed, path, problem) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) problem(path ? `${path}.${key}` : key, `unknown field ${JSON.stringify(key)}`);
  }
}

const SPEC_KEYS = ["version", "title", "subtitle", "footer", "theme", "direction", "layout", "style", "output", "nodes", "edges", "groups"];
const LAYOUT_KEYS = ["nodeGap", "rankGap", "edgeGap"];
const OUTPUT_KEYS = ["formats", "scale", "transparent", "charset"];
const NODE_KEYS = ["id", "label", "kind", "note", "accent", "color", "maxWidth", "width", "height"];
const EDGE_KEYS = ["id", "from", "to", "label", "kind", "arrow", "color"];
const GROUP_KEYS = ["id", "label", "nodes", "color"];

/**
 * Parse and validate a raw spec object. Returns a normalized copy.
 * @param {unknown} raw
 * @returns {Spec}
 */
export function parseSpec(raw) {
  /** @type {SpecIssue[]} */
  const issues = [];
  const problem = (/** @type {string} */ path, /** @type {string} */ message) => issues.push({ path, message });

  if (!isObject(raw)) {
    throw new SpecError([{ path: "(root)", message: "spec must be a JSON object" }]);
  }
  const input = /** @type {Record<string, any>} */ (raw);
  rejectUnknown(input, SPEC_KEYS, "", problem);

  if (input.version != null && input.version !== 1) {
    problem("version", `unsupported spec version ${JSON.stringify(input.version)}; expected 1`);
  }

  const str = (/** @type {string} */ path, /** @type {any} */ value, /** @type {string|null} */ fallback = null) => {
    if (value === undefined || value === null) return fallback;
    if (typeof value !== "string") {
      problem(path, "must be a string");
      return fallback;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : fallback;
  };

  const title = str("title", input.title);
  const subtitle = str("subtitle", input.subtitle);
  const footer = str("footer", input.footer);
  const theme = str("theme", input.theme, "classic") ?? "classic";

  let direction = "TB";
  if (input.direction != null) {
    const value = String(input.direction).toUpperCase();
    if (!DIRECTIONS.includes(value)) problem("direction", `unknown direction ${JSON.stringify(input.direction)}; expected one of ${DIRECTIONS.join(", ")}`);
    else direction = value;
  }

  /** @type {{nodeGap?:number, rankGap?:number, edgeGap?:number}} */
  const layout = {};
  if (input.layout != null) {
    if (!isObject(input.layout)) problem("layout", "must be an object");
    else {
      rejectUnknown(input.layout, LAYOUT_KEYS, "layout", problem);
      for (const key of LAYOUT_KEYS) {
        const value = input.layout[key];
        if (value === undefined) continue;
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) problem(`layout.${key}`, "must be a positive number");
        else layout[key] = value;
      }
    }
  }

  let style = null;
  if (input.style != null) {
    if (!isObject(input.style)) problem("style", "must be an object with theme token overrides");
    else style = input.style;
  }

  /** @type {{formats?:string[], scale?:number, transparent?:boolean, charset?:string}} */
  const output = {};
  if (input.output != null) {
    if (!isObject(input.output)) problem("output", "must be an object");
    else {
      rejectUnknown(input.output, OUTPUT_KEYS, "output", problem);
      if (input.output.formats != null) {
        if (!Array.isArray(input.output.formats) || !input.output.formats.length) problem("output.formats", "must be a non-empty array");
        else {
          const formats = [];
          for (const format of input.output.formats) {
            if (!OUTPUT_FORMATS.includes(format)) problem("output.formats", `unknown format ${JSON.stringify(format)}; expected svg, png or ascii`);
            else formats.push(format);
          }
          if (formats.length) output.formats = [...new Set(formats)];
        }
      }
      if (input.output.scale != null) {
        if (typeof input.output.scale !== "number" || !Number.isFinite(input.output.scale) || input.output.scale <= 0) problem("output.scale", "must be a positive number");
        else output.scale = input.output.scale;
      }
      if (input.output.transparent != null) {
        if (typeof input.output.transparent !== "boolean") problem("output.transparent", "must be a boolean");
        else output.transparent = input.output.transparent;
      }
      if (input.output.charset != null) {
        if (input.output.charset !== "unicode" && input.output.charset !== "ascii") problem("output.charset", 'must be "unicode" or "ascii"');
        else output.charset = input.output.charset;
      }
    }
  }

  if (!Array.isArray(input.nodes) || input.nodes.length === 0) {
    problem("nodes", "must be a non-empty array of nodes");
  }

  /** @type {Map<string, number>} */
  const nodeIndex = new Map();
  /** @type {Spec["nodes"]} */
  const nodes = [];
  if (Array.isArray(input.nodes)) {
    input.nodes.forEach((node, index) => {
      const path = `nodes[${index}]`;
      if (!isObject(node)) {
        problem(path, "must be an object");
        return;
      }
      rejectUnknown(node, NODE_KEYS, path, problem);
      const id = str(`${path}.id`, node.id);
      if (!id) {
        if (node.id !== undefined) problem(`${path}.id`, "must be a non-empty string");
        else problem(`${path}.id`, "missing required node id");
        return;
      }
      if (nodeIndex.has(id)) {
        problem(`${path}.id`, `duplicate node id ${JSON.stringify(id)} (first used by nodes[${nodeIndex.get(id)}])`);
        return;
      }
      nodeIndex.set(id, index);

      let kind = "process";
      if (node.kind != null) {
        const value = String(node.kind);
        if (!NODE_KINDS.includes(/** @type {NodeKind} */ (value))) problem(`${path}.kind`, `unknown node kind ${JSON.stringify(node.kind)}; expected one of ${NODE_KINDS.join(", ")}`);
        else kind = value;
      }
      if (kind === "junction" && node.label != null && str(`${path}.label`, node.label) !== null) {
        problem(`${path}.label`, "junction nodes do not render a label");
      }

      const label = kind === "junction" ? "" : str(`${path}.label`, node.label, id) ?? id;
      const note = str(`${path}.note`, node.note);
      if (node.accent != null && typeof node.accent !== "boolean") problem(`${path}.accent`, "must be a boolean");
      const accent = node.accent === undefined ? false : Boolean(node.accent);
      const color = str(`${path}.color`, node.color);

      /** @type {number|null} */
      let maxWidth = null;
      if (node.maxWidth != null) {
        if (typeof node.maxWidth !== "number" || !Number.isFinite(node.maxWidth) || node.maxWidth <= 0) problem(`${path}.maxWidth`, "must be a positive number");
        else maxWidth = node.maxWidth;
      }
      /** @type {number|null} */
      let width = null;
      if (node.width != null) {
        if (typeof node.width !== "number" || !Number.isFinite(node.width) || node.width <= 0) problem(`${path}.width`, "must be a positive number");
        else width = node.width;
      }
      /** @type {number|null} */
      let height = null;
      if (node.height != null) {
        if (typeof node.height !== "number" || !Number.isFinite(node.height) || node.height <= 0) problem(`${path}.height`, "must be a positive number");
        else height = node.height;
      }

      nodes.push({ id, label, kind: /** @type {NodeKind} */ (kind), note, accent, color, maxWidth, width, height });
    });
  }

  /** @type {Spec["edges"]} */
  const edges = [];
  /** @type {Set<string>} */
  const edgeIds = new Set();
  if (input.edges != null && !Array.isArray(input.edges)) {
    problem("edges", "must be an array of edges");
  }
  if (Array.isArray(input.edges)) {
    input.edges.forEach((edge, index) => {
      const path = `edges[${index}]`;
      if (!isObject(edge)) {
        problem(path, "must be an object");
        return;
      }
      rejectUnknown(edge, EDGE_KEYS, path, problem);
      const from = str(`${path}.from`, edge.from);
      const to = str(`${path}.to`, edge.to);
      if (!from) problem(`${path}.from`, "missing source node id");
      if (!to) problem(`${path}.to`, "missing target node id");
      if (from && !nodeIndex.has(from)) problem(`${path}.from`, `unknown node ${JSON.stringify(from)}`);
      if (to && !nodeIndex.has(to)) problem(`${path}.to`, `unknown node ${JSON.stringify(to)}`);
      if (from && to && from === to) problem(path, "self-loops are not supported; add a junction node instead");

      let id = str(`${path}.id`, edge.id) ?? `e${index}`;
      if (edgeIds.has(id)) {
        problem(`${path}.id`, `duplicate edge id ${JSON.stringify(id)}`);
        id = `e${index}`;
      }
      edgeIds.add(id);

      let kind = "solid";
      if (edge.kind != null) {
        const value = String(edge.kind);
        if (!EDGE_KINDS.includes(value)) problem(`${path}.kind`, `unknown edge kind ${JSON.stringify(edge.kind)}; expected one of ${EDGE_KINDS.join(", ")}`);
        else kind = value;
      }
      let arrow = "end";
      if (edge.arrow != null) {
        const value = String(edge.arrow);
        if (!ARROW_KINDS.includes(value)) problem(`${path}.arrow`, `unknown arrow ${JSON.stringify(edge.arrow)}; expected one of ${ARROW_KINDS.join(", ")}`);
        else arrow = value;
      }

      edges.push({
        id,
        from: from ?? "",
        to: to ?? "",
        label: str(`${path}.label`, edge.label),
        kind: /** @type {import("./types.js").EdgeKind} */ (kind),
        arrow: /** @type {import("./types.js").ArrowKind} */ (arrow),
        color: str(`${path}.color`, edge.color),
      });
    });
  }

  /** @type {Spec["groups"]} */
  const groups = [];
  /** @type {Set<string>} */
  const groupIds = new Set();
  /** @type {Map<string, string>} */
  const memberOf = new Map();
  if (input.groups != null && !Array.isArray(input.groups)) {
    problem("groups", "must be an array of groups");
  }
  if (Array.isArray(input.groups)) {
    input.groups.forEach((group, index) => {
      const path = `groups[${index}]`;
      if (!isObject(group)) {
        problem(path, "must be an object");
        return;
      }
      rejectUnknown(group, GROUP_KEYS, path, problem);
      let id = str(`${path}.id`, group.id) ?? `g${index}`;
      if (groupIds.has(id)) {
        problem(`${path}.id`, `duplicate group id ${JSON.stringify(id)}`);
        id = `g${index}`;
      }
      groupIds.add(id);
      const label = str(`${path}.label`, group.label, id) ?? id;
      /** @type {string[]} */
      const members = [];
      if (!Array.isArray(group.nodes) || group.nodes.length === 0) {
        problem(`${path}.nodes`, "must be a non-empty array of node ids");
      } else {
        group.nodes.forEach((member, memberIndex) => {
          const memberPath = `${path}.nodes[${memberIndex}]`;
          if (typeof member !== "string" || !nodeIndex.has(member)) {
            problem(memberPath, `unknown node ${JSON.stringify(member)}`);
            return;
          }
          if (memberOf.has(member)) {
            problem(memberPath, `node ${JSON.stringify(member)} is already part of group ${JSON.stringify(memberOf.get(member))}`);
            return;
          }
          memberOf.set(member, id);
          members.push(member);
        });
      }
      groups.push({ id, label, nodes: members, color: str(`${path}.color`, group.color) });
    });
  }

  if (issues.length) throw new SpecError(issues);

  return {
    version: 1,
    title,
    subtitle,
    footer,
    theme,
    direction: /** @type {Spec["direction"]} */ (direction),
    layout,
    style,
    output,
    nodes,
    edges,
    groups,
  };
}

/**
 * Human-readable message for a failed JSON.parse.
 * @param {string} source
 * @param {string} text
 */
export function jsonSyntaxMessage(source, text) {
  try {
    JSON.parse(text);
    return `${source}: invalid JSON`;
  } catch (error) {
    return `${source}: invalid JSON (${error instanceof Error ? error.message : String(error)})`;
  }
}
