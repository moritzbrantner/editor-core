# Source-first editor family development

Editor Core is the upstream kernel for the editor family. Coordinated development must not require publishing a new editor-core package before graph-editor, timeline-editor, layer-editor, or downstream specializations can test a change.

Consumer repositories keep semver dependencies and lockfiles as their release contract. Their source-development commands temporarily replace only the relevant installed package with a symlink to a sibling checkout, after building that checkout. The local link and source Git SHA live under `node_modules`, not in committed package metadata.

Recommended sibling layout:

```text
workspace/
  editor-core/
  graph-editor/
  layer-editor/
  timeline-editor/
  workflow-editor/
```

The consumer owns source-mode setup because it knows the package specifier it currently imports. This is especially important during package-name migrations: source development can point an existing consumer specifier at this checkout without forcing a publication or widening the release change.

## Contract

- Source mode is explicit and fails when the configured checkout is absent or is the wrong package.
- Source preparation uses frozen installs, builds the source checkout, records its Git SHA, and does not rewrite committed dependency ranges.
- A source package may recursively prepare its own source dependencies. This lets workflow-editor consume graph-editor source while graph-editor consumes editor-core source.
- Release verification explicitly restores the frozen registry install before package/consumer checks.
- Runtime editor APIs must not know about repository paths, source links, package managers, or Git revisions.

This is deliberately a development seam rather than a new editor-core abstraction. If several repositories later need richer orchestration, move that concern into shared tooling only after the duplicated workflow has been dogfooded.
