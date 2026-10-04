# Changelog

[English](./CHANGELOG.md) · [Русский](./CHANGELOG.ru.md)

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-10-04

- One package now includes an OpenCode/OpenCodez plugin with six agent tools and PNG attachments. `dorpie plugin install` connects it without rewriting user configuration.
- Shared saved-diagram library with stable IDs, searchable metadata, immutable source revisions and explicit revision conflict handling.
- Preserved exports keep source/theme snapshots, rendering settings, Dorpie version and output hashes. CLI and plugin reopen the same work across sessions.
- Configurable library/export directories, portable defaults and paginated metadata queries. The plugin and library entrypoint load the renderer only when needed.
- New save/list/get/history/export/settings CLI commands; existing stateless render behavior is preserved. English and Russian plugin/library guides ship in the package.

## [0.2.1] - 2026-10-04

### Added

- Bilingual documentation (English + Russian) for the README, spec, themes, CLI, Node API, agent guide, contributing guide and changelog. New [CLI reference](./docs/cli.md) and [Node API reference](./docs/api.md); docs now ship inside the package tarball.
- `ThemeError` is exported from the package root for code that catches theme loading errors.

### Fixed

- `dorpie render --system-fonts` now reaches the PNG rasteriser instead of being silently ignored.
- Spec validation rejects unknown fields and non-boolean `accent` / `output.transparent` values, matching the published JSON Schema and failing on typos with a JSON path.

### Changed

- Install instructions point at the versioned release tarball; npm registry publishing is documented as not yet available.

## [0.2.0] - 2026-10-04

### Changed

- Renamed the product, package, CLI, repository and registry entry to **Dorpie**. There is no `diagramcraft` compatibility layer, alias or legacy output.
- The theme gallery examples carry a small `dorpie` footer to show the footer field.

## [0.1.1] - 2026-10-04

### Fixed

- Arrowheads now rotate with the line in every renderer: markers use `orient="auto"` instead of `auto-start-reverse`, which resvg (and some other renderers) ignored, leaving sideways flags. Bidirectional edges use a mirrored start marker.
- Edge endpoints snap to the real shape border (rounded corners, diamond slopes, ellipse tops, parallelogram sides) instead of the rectangular layout box, and keep a hairline gap at arrow ends, so arrowheads sit cleanly on diamonds, stadiums and rounded cards.
- Node shadows and glows render behind edges, so they no longer wash out arrowheads and lines.
- Route cleanup merges duplicate and collinear points and collapses tiny jogs before corner rounding; corners get a minimum straight run, removing hooks and wobbles.
- Longer edge stubs near nodes (ELK `spacing.edgeNodeBetweenLayers`) so bends look deliberate.
- Paper theme edge labels are bare text instead of flat pills that masked the paper texture.

## [0.1.0] - 2026-10-04

Initial public release.

### Added

- JSON spec (nodes, edges, groups, title block, output defaults, style overrides) with structured validation and a published JSON Schema.
- Automatic orthogonal layout with rounded corners, cycles and feedback edges (ELK layered).
- Nine node kinds: terminal, process, decision, data, document, database, connector, note, junction.
- Seven built-in themes as complete visual systems: classic, paper, glass, midnight, vivid, blueprint, mono.
- Custom themes as JSON files and per-spec deep token overrides.
- Outputs: vector SVG, local PNG rasterisation with bundled OFL fonts, and Unicode/ASCII grid rendering.
- CLI (`render`, `validate`, `themes`, `schema`, `init`) and a Node API (`render`, `parseSpec`, `listThemes`).
- Example specs, including registry, release, artifact-delivery and transformer-block diagrams.
