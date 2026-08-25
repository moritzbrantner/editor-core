# Source-first editor family development

Editor Core is the upstream kernel for the editor family. Coordinated development must not require publishing a new editor-core package before graph-editor, timeline-editor, layer-editor, or downstream specializations can test a change.

Consumer repositories keep semver dependencies and lockfiles as their release contract. Their source-development commands build a sibling checkout, then materialize that build into the installed package slot under the package identity the consumer already imports. The materialized package and source Git SHA live under `node_modules`, not in committed package metadata.

Recommended sibling layout:

```text
workspace/
  editor-core/
  graph-editor/
  layer-editor/
  timeline-editor/
  workflow-editor/
```

The consumer owns source-mode setup because it knows the package specifier it currently imports. This is especially important during package-name migrations: source development can expose a current `@moenarch/editor-core` build through an older `@moritzbrantner/editor-core` consumer specifier without forcing publication or making the release dependency migration part of the same change.

## Contract

- Source mode is explicit and fails when the configured checkout is absent or is the wrong package.
- Source preparation uses frozen installs, builds the source checkout, records its Git SHA, and does not rewrite committed dependency ranges.
- The built package is materialized into the consumer's installed package slot instead of relying on cross-repository symlink resolution.
- A source package may recursively prepare its own source dependencies. This lets workflow-editor consume graph-editor source while graph-editor consumes editor-core source.
- A source smoke check verifies that the selected build is active and importable; full source verification may separately expose API drift that still requires a coordinated migration.
- Release verification explicitly restores the frozen registry install before package/consumer checks.
- Runtime editor APIs must not know about repository paths, source materialization, package managers, or Git revisions.

This is deliberately a development seam rather than a new editor-core abstraction. If several repositories later need richer orchestration, move that concern into shared tooling only after the duplicated workflow has been dogfooded.
