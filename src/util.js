// Small shared helpers.
// @ts-check

/**
 * Deep merge plain objects. Arrays and scalars replace the base value.
 * @param {any} base
 * @param {any} override
 * @returns {any}
 */
export function deepMerge(base, override) {
  if (override === undefined) return clone(base);
  if (Array.isArray(base) || Array.isArray(override)) return clone(override);
  if (base && override && typeof base === "object" && typeof override === "object") {
    const out = { ...clone(base) };
    for (const [key, value] of Object.entries(override)) {
      out[key] = key in out ? deepMerge(out[key], value) : clone(value);
    }
    return out;
  }
  return clone(override);
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function clone(value) {
  if (Array.isArray(value)) return /** @type {any} */ (value.map(clone));
  if (value && typeof value === "object") return /** @type {any} */ (Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])));
  return value;
}

/** @param {number} value @param {number} [places] */
export function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** @param {string} value */
export function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {string} value */
export function slug(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}

/** @param {string} value */
export function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
