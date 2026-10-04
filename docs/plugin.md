# OpenCode / OpenCodez plugin

[English](./plugin.md) · [Русский](./plugin.ru.md) · [Home](../README.md)

Dorpie is one package: CLI, Node library and plugin share the renderer and saved diagrams. The plugin runs inside the OpenCode backend; it starts no server, browser or background index. PNG rendering is loaded only when you export.

## Install

Node 20+ is required for the CLI. Install the release, then connect the plugin:

```sh
npm install -g https://github.com/Krablante/dorpie/releases/download/v0.5.0/dorpie-0.5.0.tgz
dorpie plugin install --app opencodez
# For upstream OpenCode instead:
# dorpie plugin install --app opencode
```

Restart the selected application/backend. The command adds a small `plugins/dorpie.js` loader to that application's global config directory. It does not rewrite your config. `--config-dir PATH` supports a custom profile. Repeating installation refreshes the managed loader; an unrelated file at that path is preserved and causes an error. Upgrade the global package and repeat the command if its installation location changes. To disconnect, remove that managed loader.

For recent loaders that support package `./server` entrypoints, you can instead add the release directly to `opencode.json` / `opencode.jsonc`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "https://github.com/Krablante/dorpie/releases/download/v0.5.0/dorpie-0.5.0.tgz"
  ]
}
```

Choose one installation method to avoid duplicate tool registration. The release tarball works without an npm registry publication. Local development can use the absolute path to `src/opencode-plugin.js` in the plugin config. The separate `./server` entrypoint keeps ordinary `import ... from "dorpie"` as the rendering API.

## Agent tools

| Tool | Purpose |
| --- | --- |
| `dorpie_help` | `topic: "schema"`, `"themes"` or `"settings"`; get the authoritative spec schema, theme list or effective paths. |
| `dorpie_list` | Search `query`, optionally filter `project`; paginate with `limit` and `offset`. |
| `dorpie_get` | Read `id` and optional `revision`, including editable `spec`. |
| `dorpie_save` | Save a complete `spec` object; optional name/description/tags/project/change. Existing `id` requires `expectedRevision`. |
| `dorpie_history` | Source revisions and preserved exports for `id`; optional `limit`/`offset`. |
| `dorpie_export` | Export `id` and optional `revision`; formats/theme/scale/transparent/charset/systemFonts. Defaults to all formats. |

The workflow is **schema → save → export → inspect PNG → get/edit/save/export**. For returning to a previous diagram, start with list/get. The JSON source is authoritative; do not edit generated SVG, PNG or ASCII. Ambiguous matches need a user choice. Save and export honor the host's `edit` permissions, including Plan Mode restrictions. PNG export returns a native file attachment as well as persistent paths; visual review requires a vision-capable model or your existing vision tool.

Tools load no complete catalog into the system prompt. Search and history return bounded metadata pages. Saved sources and exports survive new chats, compaction and application restarts. The current session/message IDs are saved as provenance on source revisions.

## Settings and remote backends

The plugin reads the same [Dorpie config](./library.md#configuration) as the CLI. Most users need no plugin options. To override it for one OpenCode profile:

```json
{
  "plugin": [[
    "https://github.com/Krablante/dorpie/releases/download/v0.5.0/dorpie-0.5.0.tgz",
    { "libraryDir": "~/diagrams/library", "exportDir": "~/diagrams/exports" }
  ]]
}
```

Available options are `libraryDir`, `exportDir` and `configFile`. Relative paths resolve against the backend's project directory; use absolute paths or `~/` for a library shared across projects. Settings are resolved at plugin initialization; reconnect/restart after changing them.

Files belong to the backend machine. A browser on another computer sees PNG attachments, but returned filesystem paths still belong to the server. Host deployment should install the same package on each server while leaving each host's library intact. The plugin needs no OpenCode core patches, account credentials or network calls for rendering.
