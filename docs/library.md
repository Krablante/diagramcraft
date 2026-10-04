# Saved diagrams

[English](./library.md) · [Русский](./library.ru.md) · [Home](../README.md)

The CLI and OpenCode plugin use one library. A saved diagram has a stable ID, a name, description, tags and an optional project label. Sessions are provenance, not storage: deleting a chat does not delete its diagrams.

## Save, reopen, edit

```sh
dorpie save diagram.json --name "Deploy flow" --tags deploy,release
# Copy the returned id. Every library command prints JSON.
dorpie list "Deploy flow"
dorpie get <id> --spec > edited.json
# Edit edited.json. Use the revision from get/history, not a guessed number.
dorpie save edited.json --id <id> --expected-revision 1 --change "Add retry"
dorpie export <id> --theme glass
dorpie history <id>
```

`save` creates revision 1. Updating an existing ID requires `--expected-revision`; a stale or missing revision fails with `CONFLICT`. Read again, reconcile the changes and save. Each revision keeps its own validated JSON and metadata. `--name`, `--description`, `--tags`, `--project` and `--change` set metadata; omitted values keep existing metadata, except the change note, which belongs to the new revision. A new CLI diagram defaults its project label to the working directory; the plugin uses the worktree root.

`get <id>` returns metadata, the editable `spec` and its archived `specPath`. Treat that archived path as read-only: edit a working copy or the returned spec object, then save a new revision. `--spec` prints just JSON suitable for editing. `--revision N` opens an older revision. IDs returned by Dorpie are authoritative; names need not be unique.

`list [query]` searches names, descriptions, tags, IDs and project labels across the library. `--project PATH` matches a project label exactly. `--limit` defaults to 50 (maximum 200); `--offset` defaults to 0. Results include `total` and `nextOffset`.

`history <id>` returns newest-first `revisions` and `exports`, separate counts and `nextOffset`. The same `--limit` and `--offset` apply independently to both lists. Listing loads metadata, not diagram sources or images.

## Preserved exports

```sh
dorpie export <id> --revision 1 --format svg,png --theme paper --scale 3
dorpie export <id> --export-dir ./deliverables
```

Export defaults to SVG, PNG and ASCII, independently of the spec's `output.formats`. Other rendering options use the spec's settings and normal renderer defaults. Each export pins one source revision and gets a unique directory under `<exportDir>/<diagramID>/<exportID>/`. It contains `diagram.svg`, `diagram.png` and/or `diagram.txt`, plus `spec.json`, the fully resolved `theme.json`, and `export.json` with settings, Dorpie version and SHA-256 hashes. Old files are never overwritten. Rendering errors do not add successful exports to history. Exporting a different theme or scale does not create a source revision.

Historical export records remain in the library even if you choose another export directory later. Moving or deleting exported files outside Dorpie makes their recorded paths unavailable. Keep the library and export folders in your backups.

Plain `dorpie render spec.json` retains its original stateless behavior, including overwriting outputs and `--out`. Use it for disposable renders, streams or generated documentation. Use `export` for saved work; its destination option is `--export-dir`.

## Configuration

No configuration is required. On Linux, the library defaults to `$XDG_DATA_HOME/dorpie` or `~/.local/share/dorpie`; exports default to `<libraryDir>/exports`. On macOS the default data directory is `~/Library/Application Support/dorpie`; on Windows it is `%LOCALAPPDATA%/dorpie`.

The optional config file is `$XDG_CONFIG_HOME/dorpie/config.json`, normally `~/.config/dorpie/config.json` (Windows: `%APPDATA%/dorpie/config.json`):

```json
{
  "libraryDir": "~/diagrams/library",
  "exportDir": "~/diagrams/exports"
}
```

`dorpie settings` shows resolved absolute paths without creating folders. Precedence is explicit CLI/library/plugin options, then `DORPIE_LIBRARY_DIR` and `DORPIE_EXPORT_DIR`, then config, then defaults. `--config` / API `configFile` / `DORPIE_CONFIG` selects another config file; a missing explicit file is an error. Relative config paths resolve beside the config file. Explicit relative paths resolve against the CLI working directory or the plugin's project directory. `~/` expands to the user's home.

The library is local to the machine running Dorpie. Reopening from another session on that machine works automatically. Different servers have different libraries. For transfer, copy a consistent library and its exports; concurrent writes from multiple machines to a network filesystem are not supported. No synchronization service is started.

Revisions and exports are published as complete directories. Concurrent writers with the same expected revision cannot replace each other. An interrupted operation may leave a hidden `.pending-*` directory; it is ignored by readers and can be removed after the writer has stopped. Revisions and exports have no automatic expiry.

## Storage and costs

Each source revision stores one full JSON spec and metadata. Each export stores the requested files plus source, theme and export metadata; the library keeps another small export record so history survives a change of export directory. There is no background index. `list` scans the diagram folders and revision directory names, reads the latest metadata for each diagram, then sorts the matches. Pagination bounds the response, not that scan. `history` scans one diagram's revision/export names and reads metadata for the requested page. A long revision history increases directory work; a large catalog increases metadata reads.

Keep backups of both source and exports. Stop writers while taking or restoring a snapshot, preserve custom theme files too, and run `settings`, `list`, `get` and `history` after restoring. Absolute export paths still refer to the original location if you move folders. A crash between publishing export files and recording their catalog entry can leave a complete export missing from history; its `export.json` and files remain available in the export directory. Do not remove a folder merely because it is absent from a history page.

## Node API

```js
import { createLibrary } from "dorpie/library";

const library = createLibrary(); // optional { libraryDir, exportDir, configFile }
const saved = await library.save(spec, { name: "Deploy flow", tags: ["deploy"] });
const opened = await library.get(saved.id);
await library.save(editedSpec, {
  id: opened.id,
  expectedRevision: opened.revision,
  change: "Add retry",
});
const exported = await library.export(saved.id, { formats: ["svg", "png"] });
await library.list({ query: "deploy", limit: 20 });
await library.history(saved.id);
```

`createLibrary(options?, directory?)` resolves settings once. Its `config` property exposes the paths. `get(id, revision?)`, `save(spec, metadata?)`, `list(filter?)`, `history(id, pagination?)` and `export(id, options?)` return promises. Export options match `render`, with an optional `revision`; file theme paths resolve against `directory`. `LibraryError.code` is `INVALID_ARGUMENT`, `NOT_FOUND` or `CONFLICT`; spec/theme validation keeps the existing errors. The library import avoids loading the renderer until export. See [plugin.md](./plugin.md) for agent tools.
