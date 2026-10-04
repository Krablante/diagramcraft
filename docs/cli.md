# CLI reference

[English](./cli.md) · [Русский](./cli.ru.md) · [Home](../README.md)

`dorpie` is a single executable with five commands. It reads a JSON spec from a file or from standard input, and has no config file and no environment variables: everything comes from command-line arguments and the spec itself. Node 20 or newer is required.

| Command | Purpose |
| --- | --- |
| `dorpie render <spec.json\|->` | Render the spec to one or more formats. |
| `dorpie validate <spec.json\|->` | Parse and validate the spec without rendering. |
| `dorpie themes [id]` | List built-in themes, or print one resolved theme as JSON. |
| `dorpie schema` | Print the JSON Schema of the spec. |
| `dorpie init [file.json]` | Write a starter spec. |
| `dorpie --help`, `dorpie --version` | Usage and version. |

## render

```
dorpie render <spec.json|-> [options]
```

| Option | Meaning | Default |
| --- | --- | --- |
| `-t, --theme <id\|file.json>` | Override the theme from the spec; a built-in id or a path to a theme JSON file. | spec `theme`, then `classic` |
| `-f, --format <list>` | Comma-separated `svg,png,ascii`. | spec `output.formats`, then `svg` |
| `-o, --out <path\|->` | Output file, directory, or `-` for stdout. | next to the input spec |
| `--scale <n>` | PNG scale multiplier. | spec `output.scale`, then `2` |
| `--transparent` | Drop the canvas background in SVG and PNG. | `false` |
| `--system-fonts` | Allow system font fallback for PNG rendering. | `false` |
| `--charset <unicode\|ascii>` | Character set for ASCII output. | spec `output.charset`, then `unicode` |
| `-q, --quiet` | Do not print the paths of written files. | off |

Output paths work like this:

- Without `--out`, files are written next to the input spec and named after it: `spec.svg`, `spec.png`, `spec.txt`. ASCII uses the `.txt` extension.
- `--out dir/`, or a path to an existing directory, puts the files in that directory under the input base name.
- `--out file` accepts exactly one format; with several formats the command fails with exit code `2`.
- `--out -` writes exactly one format to stdout and adds no other text. Several formats to stdout are rejected.
- Input `-` reads the spec from stdin. Without `--out`, files land in the current directory under the base name `diagram`, for example `diagram.svg`.
- Existing output files are overwritten on every render. Generated SVG, PNG and ASCII files are outputs, never editable sources.

```sh
# all formats the spec asks for, next to the spec
dorpie render spec.json

# override formats and output directory
dorpie render spec.json --format svg,png --out out/

# one format to one file, with theme and scale overrides
dorpie render spec.json --format png --theme glass --scale 3 --out out/diagram.png

# spec from stdin, ASCII to stdout
cat spec.json | dorpie render - --format ascii --out - > diagram.txt
```

## validate

`validate` parses the spec and reports every problem with its JSON path; it writes no files. A clean spec prints a one-line summary:

```sh
$ dorpie validate examples/quickstart.json
ok: 6 nodes, 6 edges, 0 groups, theme "classic"

$ dorpie validate examples/quickstart.json --json
{"ok":true,"theme":"classic","nodes":6,"edges":6,"groups":0}
```

An invalid spec exits with code `2`:

```sh
$ dorpie validate broken.json
spec error: 2 problems
  nodes[1].id: duplicate node id "build" (first used by nodes[0])
  edges[0].to: unknown node "ships"
```

See [spec.md](./spec.md) for the field reference and the JSON Schema (`dorpie schema`).

## themes

Without an argument, `themes` lists the built-in ids and descriptions. With an id, it prints the fully resolved theme (merged over the base defaults) as JSON — a good starting point for a custom theme:

```sh
dorpie themes                             # id, title and description per line
dorpie themes --json                      # same metadata as JSON
dorpie themes paper > my-theme.json       # write a full theme file
dorpie render spec.json --theme my-theme.json
```

Unknown ids fail with exit code `2` and the list of available themes.

## schema

`schema` prints the JSON Schema of the spec to stdout, for editor validation or for agents that want the exact shape:

```sh
dorpie schema > diagram.schema.json
```

## init

`init` writes a small starter spec that requests SVG, PNG and ASCII, and prints the path it wrote:

```sh
dorpie init                # writes ./diagram.json
dorpie init hello.json
dorpie init hello.json --force   # overwrite an existing file
```

Without `--force`, `init` refuses to replace an existing file and exits with code `2`.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success. |
| `2` | Invalid spec, unknown theme, or bad CLI arguments; the message explains what to fix. |
| `1` | Runtime failure, for example an unreadable input file or an IO error. |

Spec and theme errors go to stderr with readable paths, so a script can rely on the code and still log the message.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `dorpie: command not found` | The global npm bin directory is not in `PATH`. Find it with `npm prefix -g`, or run the checkout directly: `node /path/to/dorpie/bin/dorpie.js`. |
| `unknown theme "..."` | Run `dorpie themes`. A custom theme is only treated as a file path when it ends in `.json` or contains `/`; otherwise it must be a built-in id. |
| `theme file not found` | Relative theme paths resolve from the current working directory, not from the spec file. Use an absolute path or `cd` first. |
| `cannot write ... to a single file` / `stdout can only carry one format` | `--out file` and `--out -` accept one format. Pass a directory, or split the command per format. |
| PNG looks different from SVG | SVG references font family names, and viewers substitute missing system fonts; PNG uses the bundled OFL fonts. Keep bundled families for consistent output, or pass `--system-fonts` and accept host-dependent rendering. |
| Text outside Latin, Greek and Cyrillic renders as boxes | The bundled fonts do not cover every script. Use `--system-fonts` with a suitable font installed, or add a font to a fork (see [themes.md](./themes.md)). |
| `unknown field "..."` in validation | A typo or unsupported field; `dorpie schema` shows the exact shape. |
| `junction nodes do not render a label` | Junction nodes are silent merge dots. Remove the label or use a different node kind. |
| `self-loops are not supported` | An edge points to its own source node. Add a junction node or route the retry through another node. |
| The diagram “did not change” | Output files are overwritten on every render, but only from the spec. Edit the JSON, not the SVG/PNG, then render again. |

For the spec fields see [spec.md](./spec.md); for agent-oriented workflows see [agents.md](./agents.md).
