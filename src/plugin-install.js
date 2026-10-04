// @ts-check
import { mkdir, readFile, rename, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { defaultPaths, LibraryError } from "./config.js";

/** Install a tiny loader; no JSONC rewrite or dependency duplication.
 * @param {{app?:string, configDir?:string}} [options]
 */
export async function installPlugin(options = {}) {
  const app = options.app ?? "opencodez";
  if (!["opencode", "opencodez"].includes(app)) throw new LibraryError("app must be opencode or opencodez");
  const configDir = options.configDir ? resolve(options.configDir) : join(defaultPaths().configHome, app);
  const target = join(configDir, "plugins", "dorpie.js");
  const marker = "// Managed by dorpie plugin install\n";
  try {
    if (!(await readFile(target, "utf8")).startsWith(marker)) throw new LibraryError(`Refusing to replace an unmanaged plugin: ${target}`);
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  await mkdir(join(configDir, "plugins"), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${marker}export { default } from ${JSON.stringify(new URL("./opencode-plugin.js", import.meta.url).href)};\n`, { flag: "wx" });
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
  return { app, plugin: target, restartRequired: true };
}
