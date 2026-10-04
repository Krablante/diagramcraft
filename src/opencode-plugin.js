// The plugin entrypoint deliberately avoids importing the renderer until export.
// @ts-check
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { createLibrary } from "./library.js";
import { listThemes } from "./themes.js";

/** @typedef {{directory:string, worktree?:string, project?:{id?:string}}} PluginInput */
/** @typedef {{sessionID:string, messageID:string, directory:string, worktree?:string, ask:(input:{permission:string,patterns:string[],always:string[],metadata:object})=>Promise<void>}} ToolContext */

const id = z.string().describe("Stable diagram ID returned by dorpie_list or dorpie_save");
const revision = z.number().int().positive().optional().describe("Omit for the latest revision");
const page = { limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().nonnegative().optional() };
/** @param {unknown} value */
const output = (value) => ({ output: JSON.stringify(value, null, 2) });

export default {
  id: "dorpie",
  /** @param {PluginInput} input @param {import('./config.js').LibraryOptions} [options] */
  async server(input, options = {}) {
    const library = createLibrary(options, input.directory);
    /** @param {ToolContext} context @param {string[]} paths */
    const edit = (context, paths) => context.ask({ permission: "edit", patterns: paths, always: paths.map((p) => `${p}/**`), metadata: { tool: "dorpie", paths } });
    return {
      tool: {
        dorpie_help: {
          description: "Get Dorpie's JSON diagram schema, seven visual themes, or library settings. Use schema before creating your first diagram. Edit only JSON sources; inspect the exported PNG and refine the spec. Saved diagrams persist across sessions.",
          args: { topic: z.enum(["schema", "themes", "settings"]) },
          async execute(args) {
            if (args.topic === "schema") return { output: await readFile(new URL("../schema/diagram.schema.json", import.meta.url), "utf8") };
            return output(args.topic === "themes" ? listThemes() : library.config);
          },
        },
        dorpie_list: {
          description: "Find saved Dorpie diagrams across sessions by name, description, tags or ID. Searches all projects by default. Use project to filter by worktree path. Never guess between ambiguous matches.",
          args: { query: z.string().optional(), project: z.string().optional(), ...page },
          async execute(args) { return output(await library.list(args)); },
        },
        dorpie_get: {
          description: "Read a saved diagram's JSON spec and revision. Edit the returned spec object and use dorpie_save with expectedRevision; the archived specPath is read-only.",
          args: { id, revision },
          async execute(args) { return output(await library.get(args.id, args.revision)); },
        },
        dorpie_save: {
          description: "Create a persistent diagram or save a new immutable revision. Pass the entire spec object; get its schema from dorpie_help. For updates, id and expectedRevision are required. Save then dorpie_export to render and visually inspect a PNG. Validation failures save nothing.",
          args: { spec: z.record(z.string(), z.unknown()), id: id.optional(), expectedRevision: z.number().int().positive().optional(),
            name: z.string().min(1).optional(), description: z.string().optional(), tags: z.array(z.string().min(1)).optional(),
            project: z.string().optional(), change: z.string().optional() },
          /** @param {any} args @param {ToolContext} context */
          async execute(args, context) {
            await edit(context, [library.config.libraryDir]);
            const { spec, ...settings } = args;
            return output(await library.save(spec, { ...settings, project: settings.project ?? (settings.id ? undefined : context.worktree ?? input.worktree ?? context.directory),
              origin: { sessionID: context.sessionID, messageID: context.messageID } }));
          },
        },
        dorpie_history: {
          description: "Read immutable source revisions and export history for a saved diagram. Exports reference a specific revision and keep files, settings and checksums.",
          args: { id, ...page },
          async execute(args) { const { id, ...filter } = args; return output(await library.history(id, filter)); },
        },
        dorpie_export: {
          description: "Export a saved revision to SVG, PNG and ASCII (all three by default). Every export is preserved. Returns paths and an attached PNG for visual review. Exporting does not change the source revision.",
          args: { id, revision, formats: z.array(z.enum(["svg", "png", "ascii"])).min(1).optional(), theme: z.string().optional(),
            scale: z.number().positive().optional(), transparent: z.boolean().optional(), charset: z.enum(["unicode", "ascii"]).optional(), systemFonts: z.boolean().optional() },
          /** @param {any} args @param {ToolContext} context */
          async execute(args, context) {
            await edit(context, [...new Set([library.config.libraryDir, library.config.exportDir])]);
            const { id, ...settings } = args;
            const exported = await library.export(id, settings);
            const attachments = exported.files.png ? [{ type: "file", mime: "image/png", filename: "diagram.png",
              url: `data:image/png;base64,${(await readFile(exported.files.png)).toString("base64")}` }] : [];
            return { ...output(exported), title: `Dorpie: revision ${exported.revision}`, attachments };
          },
        },
      },
    };
  },
};
