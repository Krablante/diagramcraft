// Thin command-line wrapper around the public API. The library interface in
// index.js is the primary product surface; this file only does IO, argument
// parsing and exit codes.
// @ts-check
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseSpec, SpecError } from "./spec.js";
import { listThemes, getTheme, ThemeError } from "./themes.js";
import { createLibrary, LibraryError } from "./library.js";
import { installPlugin } from "./plugin-install.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));

const HELP = `dorpie ${pkg.version} — beautiful diagrams from a JSON spec

Usage:
  dorpie render <spec.json|-> [options]     render SVG, PNG and/or ASCII
  dorpie validate <spec.json|-> [--json]    check a spec without rendering
  dorpie themes [id] [--json]               list themes or print one theme
  dorpie schema                             print the spec JSON Schema
  dorpie init [file.json] [--force]         write a starter spec
  dorpie save <spec.json|-> [--id ID --expected-revision N] [--name NAME]
  dorpie list [query] [--project PATH] [--limit N --offset N]
  dorpie get <id> [--revision N] [--spec]   read editable JSON
  dorpie history <id> [--limit N --offset N]
  dorpie export <id> [--revision N] [render options]
  dorpie settings                         show resolved library paths
  dorpie plugin install [--app opencodez|opencode] [--config-dir PATH]

Library options:
      --library-dir PATH      source revisions and metadata
      --export-dir PATH       preserved exports (default: library/exports)
      --config PATH           Dorpie config JSON
      --description TEXT      searchable diagram description
      --tags LIST             comma-separated tags
      --change TEXT           revision note
      --project PATH          project/worktree label (save default: cwd)
Library commands print JSON. Export defaults to svg,png,ascii.

Render options:
  -t, --theme <id|file.json>   override the theme from the spec
  -f, --format <list>          svg,png,ascii (default: spec output.formats or svg)
  -o, --out <path|->           file, directory, or - for stdout (default: next to input)
      --scale <n>              PNG scale factor (default 2)
      --transparent            transparent canvas (PNG/SVG)
      --system-fonts           allow fallback to system fonts for PNG
      --charset <unicode|ascii> ASCII character set (default unicode)
  -q, --quiet                  do not print written file paths

Examples:
  dorpie render diagram.json --format svg,png,ascii
  dorpie render diagram.json --theme light -o out/
`;

/**
 * @param {string[]} argv
 * @returns {Promise<number>} exit code
 */
export async function run(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        theme: { type: "string", short: "t" },
        format: { type: "string", short: "f" },
        out: { type: "string", short: "o" },
        scale: { type: "string" },
        transparent: { type: "boolean" },
        "system-fonts": { type: "boolean" },
        charset: { type: "string" },
        json: { type: "boolean" },
        force: { type: "boolean" },
        quiet: { type: "boolean", short: "q" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
        "library-dir": { type: "string" }, "export-dir": { type: "string" }, config: { type: "string" },
        id: { type: "string" }, "expected-revision": { type: "string" }, revision: { type: "string" },
        name: { type: "string" }, description: { type: "string" }, tags: { type: "string" }, change: { type: "string" },
        project: { type: "string" }, limit: { type: "string" }, offset: { type: "string" }, spec: { type: "boolean" },
        app: { type: "string" }, "config-dir": { type: "string" },
      },
    });
  } catch (error) {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  const { values, positionals } = parsed;
  const command = positionals[0] ?? (values.help ? "help" : values.version ? "version" : "help");

  try {
    if (command === "help" || values.help) {
      process.stdout.write(HELP);
      return 0;
    }
    if (command === "version" || values.version) {
      process.stdout.write(`${pkg.version}\n`);
      return 0;
    }
    const commandOptions = {
      render: ["theme", "format", "out", "scale", "transparent", "system-fonts", "charset", "quiet"],
      validate: ["json"], themes: ["json"], schema: [], init: ["force"],
    };
    if (Object.hasOwn(commandOptions, command)) {
      for (const key of Object.keys(values)) if (!commandOptions[command].includes(key)) throw new LibraryError(`--${key} is not supported by ${command}`);
      const maxArgs = command === "schema" ? 0 : 1;
      if (positionals.length - 1 > maxArgs) throw new LibraryError(`Unexpected arguments for ${command}`);
    }
    if (command === "render") return await renderCommand(positionals.slice(1), values);
    if (command === "validate") return validateCommand(positionals.slice(1), values);
    if (command === "themes") return themesCommand(positionals.slice(1), values);
    if (command === "schema") {
      process.stdout.write(readFileSync(join(here, "..", "schema", "diagram.schema.json"), "utf8"));
      return 0;
    }
    if (command === "init") return initCommand(positionals.slice(1), values);
    if (["save", "list", "get", "history", "export", "settings", "plugin"].includes(command)) return await libraryCommand(command, positionals.slice(1), values);
    process.stderr.write(`error: unknown command ${JSON.stringify(command)}\n\n${HELP}`);
    return 2;
  } catch (error) {
    if (error instanceof SpecError) {
      if (command === "validate" && values.json) {
        process.stdout.write(`${JSON.stringify({ ok: false, issues: error.issues })}\n`);
        return 2;
      }
      process.stderr.write(`spec error: ${error.issues.length} problem${error.issues.length === 1 ? "" : "s"}\n`);
      for (const issue of error.issues) process.stderr.write(`  ${issue.path}: ${issue.message}\n`);
      return 2;
    }
    if (error instanceof ThemeError) {
      process.stderr.write(`theme error: ${error.message}\n`);
      return 2;
    }
    if (error instanceof LibraryError) {
      process.stderr.write(`error [${error.code}]: ${error.message}\n`);
      return 2;
    }
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

/** @param {string} command @param {string[]} args @param {Record<string,any>} values */
async function libraryCommand(command, args, values) {
  const allowed = {
    plugin: ["app", "config-dir"], settings: [],
    save: ["id", "expected-revision", "name", "description", "tags", "project", "change"],
    list: ["project", "limit", "offset"], get: ["revision", "spec"], history: ["limit", "offset"],
    export: ["revision", "theme", "format", "scale", "transparent", "charset", "system-fonts"],
  };
  for (const key of Object.keys(values)) {
    if (!["json", ...(command === "plugin" ? [] : ["library-dir", "export-dir", "config"]), ...allowed[command]].includes(key)) throw new LibraryError(`--${key} is not supported by ${command}`);
  }
  if (command === "plugin") {
    if (args.length !== 1 || args[0] !== "install") throw new LibraryError("Use dorpie plugin install [--app opencodez|opencode]");
    process.stdout.write(`${JSON.stringify(await installPlugin({ app: values.app, configDir: values["config-dir"] }), null, 2)}\n`);
    if (!values.json) process.stderr.write("Restart the selected application to load Dorpie.\n");
    return 0;
  }
  if (args.length > (command === "settings" ? 0 : 1)) throw new LibraryError(`Unexpected arguments for ${command}`);
  const library = createLibrary({ libraryDir: values["library-dir"], exportDir: values["export-dir"], configFile: values.config });
  /** @param {string} key */
  const number = (key) => {
    if (values[key] === undefined) return undefined;
    const value = Number(values[key]);
    if (!Number.isSafeInteger(value) || value < (key === "offset" ? 0 : 1)) throw new LibraryError(`--${key} must be ${key === "offset" ? "a nonnegative" : "a positive"} integer`);
    return value;
  };
  const page = { limit: number("limit"), offset: number("offset") };
  let result;
  if (command === "settings") result = library.config;
  if (command === "list") result = await library.list({ query: args[0], project: values.project, ...page });
  if (["save", "get", "history", "export"].includes(command) && !args[0]) throw new LibraryError(`Missing ${command === "save" ? "spec path (or -)" : "diagram ID"}`);
  if (command === "save") {
    const input = readSpecInput(args[0]);
    result = await library.save(parseInput(input.text, input.path), { id: values.id, expectedRevision: number("expected-revision"),
      name: values.name, description: values.description, tags: values.tags?.split(",").map((t) => t.trim()).filter(Boolean),
      change: values.change, project: values.project ?? (values.id ? undefined : process.cwd()) });
  }
  if (command === "get") {
    result = await library.get(args[0], number("revision"));
    if (values.spec) result = result.spec;
  }
  if (command === "history") result = await library.history(args[0], page);
  if (command === "export") {
    result = await library.export(args[0], { revision: number("revision"), theme: values.theme,
      formats: values.format?.split(",").map((f) => f.trim()), scale: values.scale === undefined ? undefined : Number(values.scale),
      transparent: values.transparent, charset: values.charset, systemFonts: values["system-fonts"] });
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

/**
 * @param {string} input
 * @returns {{text:string, path:string|null}}
 */
function readSpecInput(input) {
  if (!input || input === "-") return { text: readFileSync(0, "utf8"), path: null };
  const path = resolve(input);
  return { text: readFileSync(path, "utf8"), path };
}

/** @param {string} text @param {string|null} path */
function parseInput(text, path) {
  try {
    return parseSpec(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new SpecError([{ path: path ? basename(path) : "(stdin)", message: `invalid JSON: ${error.message}` }]);
    }
    throw error;
  }
}

/**
 * @param {string[]} args
 * @param {Record<string, any>} values
 */
async function renderCommand(args, values) {
  const input = args[0];
  if (!input) throw new SpecError([{ path: "render", message: "missing input spec path (or - for stdin)" }]);
  const { text, path } = readSpecInput(input);
  const spec = parseInput(text, path);

  /** @type {Array<"svg"|"png"|"ascii">} */
  const formats = /** @type {any} */ ([...new Set(
    values.format !== undefined
      ? String(values.format)
          .split(",")
          .map((f) => f.trim())
      : spec.output?.formats ?? ["svg"]
  )]);
  if (!formats.length) throw new SpecError([{ path: "--format", message: "must contain svg, png and/or ascii" }]);
  for (const format of formats) {
    if (!["svg", "png", "ascii"].includes(format)) throw new SpecError([{ path: "--format", message: `unknown format ${JSON.stringify(format)}; expected svg, png or ascii` }]);
  }
  const scale = values.scale !== undefined ? Number(values.scale) : undefined;
  if (values.scale !== undefined && (!Number.isFinite(scale) || scale <= 0)) throw new SpecError([{ path: "--scale", message: "must be a positive number" }]);
  if (values.charset && values.charset !== "unicode" && values.charset !== "ascii") throw new SpecError([{ path: "--charset", message: 'must be "unicode" or "ascii"' }]);

  const targets = resolveOutputs(path, values.out, formats);
  if (path) {
    const source = statSync(path);
    for (const target of targets.values()) {
      const output = target && existsSync(target) ? statSync(target) : null;
      if (target === path || (output && output.dev === source.dev && output.ino === source.ino)) throw new SpecError([{ path: "--out", message: "output must not overwrite the input spec" }]);
    }
  }
  const { render } = await import("./index.js");
  const result = await render(spec, {
    theme: values.theme,
    formats,
    scale,
    transparent: values.transparent,
    systemFonts: values["system-fonts"],
    charset: values.charset,
  });

  for (const format of formats) {
    const target = targets.get(format);
    const data = format === "svg" ? result.svg : format === "ascii" ? result.ascii : result.png;
    if (target === null) {
      process.stdout.write(/** @type {any} */ (data));
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, /** @type {any} */ (data));
    if (!values.quiet) process.stdout.write(`${format}  ${target}\n`);
  }
  return 0;
}

/**
 * Resolve where each format goes. null means stdout.
 * @param {string|null} inputPath
 * @param {string|undefined} out
 * @param {string[]} formats
 * @returns {Map<string,string|null>}
 */
function resolveOutputs(inputPath, out, formats) {
  if (out !== undefined && !out.trim()) throw new SpecError([{ path: "--out", message: "must be a nonempty path or -" }]);
  const base = inputPath ? basename(inputPath, extname(inputPath)) : "diagram";
  const extension = { svg: "svg", png: "png", ascii: "txt" };
  /** @type {Map<string,string|null>} */
  const map = new Map();
  if (out === "-") {
    if (formats.length > 1) throw new SpecError([{ path: "--out", message: "stdout can only carry one format; pass --out to a file or directory" }]);
    map.set(formats[0], null);
    return map;
  }
  if (!out) {
    const dir = inputPath ? dirname(inputPath) : process.cwd();
    for (const format of formats) map.set(format, join(dir, `${base}.${extension[format] ?? format}`));
    return map;
  }
  const target = resolve(out);
  const looksLikeDirectory = /[\\/]$/.test(out) || (existsSync(target) && statSync(target).isDirectory());
  if (looksLikeDirectory) {
    for (const format of formats) map.set(format, join(target, `${base}.${extension[format] ?? format}`));
    return map;
  }
  if (formats.length > 1) throw new SpecError([{ path: "--out", message: `cannot write ${formats.join(", ")} to a single file; pass a directory instead` }]);
  map.set(formats[0], target);
  return map;
}

/**
 * @param {string[]} args
 * @param {Record<string, any>} values
 */
function validateCommand(args, values) {
  const input = args[0];
  if (!input) throw new SpecError([{ path: "validate", message: "missing input spec path (or - for stdin)" }]);
  const { text, path } = readSpecInput(input);
  const spec = parseInput(text, path);
  if (values.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, theme: spec.theme, nodes: spec.nodes.length, edges: spec.edges.length, groups: spec.groups.length })}\n`);
  } else {
    process.stdout.write(`ok: ${spec.nodes.length} nodes, ${spec.edges.length} edges, ${spec.groups.length} groups, theme "${spec.theme}"\n`);
  }
  return 0;
}

/**
 * @param {string[]} args
 * @param {Record<string, any>} values
 */
function themesCommand(args, values) {
  const id = args[0];
  if (id) {
    const theme = id.endsWith(".json") || id.includes("/") ? undefined : getTheme(id);
    if (theme) {
      process.stdout.write(`${JSON.stringify(theme, null, 2)}\n`);
      return 0;
    }
    throw new ThemeError(`cannot print theme ${JSON.stringify(id)}; run "dorpie themes" for the list`);
  }
  const themes = listThemes();
  if (values.json) {
    process.stdout.write(`${JSON.stringify(themes, null, 2)}\n`);
    return 0;
  }
  for (const theme of themes) {
    process.stdout.write(`${theme.id.padEnd(10)} ${theme.title.padEnd(12)} ${theme.description}\n`);
  }
  return 0;
}

/**
 * @param {string[]} args
 * @param {Record<string, any>} values
 */
function initCommand(args, values) {
  const file = resolve(args[0] ?? "diagram.json");
  if (existsSync(file) && !values.force) throw new SpecError([{ path: file, message: "file already exists; pass --force to overwrite" }]);
  const spec = {
    version: 1,
    title: "How it works",
    subtitle: "Edit this file and render again",
    theme: "paper",
    direction: "TB",
    output: { formats: ["svg", "png", "ascii"] },
    nodes: [
      { id: "start", kind: "terminal", label: "Start" },
      { id: "idea", kind: "process", label: "Write the spec" },
      { id: "check", kind: "decision", label: "Looks right?" },
      { id: "render", kind: "process", label: "Render every format", note: "svg, png, ascii" },
      { id: "tweak", kind: "process", label: "Adjust nodes or theme" },
      { id: "end", kind: "terminal", label: "Done" },
    ],
    edges: [
      { from: "start", to: "idea" },
      { from: "idea", to: "check" },
      { from: "check", to: "render", label: "yes" },
      { from: "check", to: "tweak", label: "no" },
      { from: "tweak", to: "idea", label: "retry" },
      { from: "render", to: "end" },
    ],
  };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(spec, null, 2)}\n`, { flag: values.force ? "w" : "wx" });
  process.stdout.write(`${file}\n`);
  return 0;
}
