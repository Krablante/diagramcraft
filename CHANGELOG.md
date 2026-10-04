# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

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
