// @ts-check
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

export class LibraryError extends Error {
  /** @param {string} message @param {string} [code] */
  constructor(message, code = "INVALID_ARGUMENT") {
    super(message);
    this.name = "LibraryError";
    this.code = code;
  }
}

/** @typedef {{libraryDir?:string, exportDir?:string, configFile?:string}} LibraryOptions */

/** @param {string} value @param {string} base */
function absolute(value, base) {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return resolve(homedir(), value.slice(2));
  return resolve(base, value);
}

/** Portable application directories; XDG overrides also work outside Linux. */
export function defaultPaths() {
  const home = homedir();
  const config = process.env.XDG_CONFIG_HOME || (process.platform === "win32" ? process.env.APPDATA || join(home, "AppData", "Roaming") : join(home, ".config"));
  const data = process.env.XDG_DATA_HOME || (process.platform === "win32" ? process.env.LOCALAPPDATA || join(home, "AppData", "Local") : process.platform === "darwin" ? join(home, "Library", "Application Support") : join(home, ".local", "share"));
  return { configFile: join(config, "dorpie", "config.json"), libraryDir: join(data, "dorpie"), configHome: config };
}

/** Resolve only library settings. Plain render() and render CLI stay stateless.
 * @param {LibraryOptions} [options]
 * @param {string} [directory] relative explicit paths belong to the caller
 */
export function resolveConfig(options = {}, directory = process.cwd()) {
  const defaults = defaultPaths();
  const explicit = options.configFile ?? process.env.DORPIE_CONFIG;
  const configFile = absolute(explicit ?? defaults.configFile, directory);
  /** @type {{libraryDir?:string,exportDir?:string}} */
  let file = {};
  try {
    file = JSON.parse(readFileSync(configFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT" || explicit) throw new LibraryError(`Cannot read config ${configFile}: ${error.message}`);
  }
  if (!file || typeof file !== "object" || Array.isArray(file)) throw new LibraryError("Dorpie config must be an object");
  for (const [key, value] of Object.entries(file)) {
    if (!["libraryDir", "exportDir"].includes(key)) throw new LibraryError(`Unknown Dorpie config field: ${key}`);
    if (typeof value !== "string" || !value.trim()) throw new LibraryError(`${key} must be a nonempty path`);
  }
  for (const [key, value] of Object.entries(options)) {
    if (!["libraryDir", "exportDir", "configFile"].includes(key)) throw new LibraryError(`Unknown Dorpie option: ${key}`);
    if (value !== undefined && (typeof value !== "string" || !value.trim())) throw new LibraryError(`${key} must be a nonempty path`);
  }
  const libraryDir = options.libraryDir !== undefined ? absolute(options.libraryDir, directory)
    : process.env.DORPIE_LIBRARY_DIR ? absolute(process.env.DORPIE_LIBRARY_DIR, directory)
    : file.libraryDir ? absolute(file.libraryDir, dirname(configFile)) : defaults.libraryDir;
  const exportDir = options.exportDir !== undefined ? absolute(options.exportDir, directory)
    : process.env.DORPIE_EXPORT_DIR ? absolute(process.env.DORPIE_EXPORT_DIR, directory)
    : file.exportDir ? absolute(file.exportDir, dirname(configFile)) : join(libraryDir, "exports");
  if (!isAbsolute(libraryDir) || !isAbsolute(exportDir)) throw new LibraryError("Library paths must resolve to absolute paths");
  return { libraryDir, exportDir, configFile };
}
