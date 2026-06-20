# Changelog

All notable changes to `@moenarch/editor-core` are documented here.

This package follows semver. While the package is in `0.x`, breaking changes may ship in minor releases, but every breaking change must be called out in this file.

## 0.4.1

- Re-published the `@moenarch/editor-core` package through the GitHub Actions trusted publishing flow.
- No runtime API changes are intended in this release.

## 0.4.0

- Moved the package to `@moenarch/editor-core`.
- Consumers should update imports from `@moritzbrantner/editor-core/*` to
  `@moenarch/editor-core/*`.
- No runtime API changes are intended in this release.
- The old `@moritzbrantner/editor-core` package will be deprecated after this package is published.

## 0.2.1

- Added `@moenarch/editor-core/sync` with headless remote operation apply helpers and
  explicit persistence conflict resolution helpers.

## 0.2.0

- Added adapter contract helpers under `@moenarch/editor-core/testing`.
- Added persistence lifecycle events for load/save observability.
- Improved React autosave behavior with latest-revision follow-up saves and optional retry.
- Added command diagnostics for duplicate ids, invalid hotkeys, conflicts, and empty labels.
- Added collaboration primitives for presence state, remote operation dedupe, and revision-token
  tracking.
- Added JSON-compatible patch diff, apply, and inversion helpers.
- Added plugin registry helpers for composing commands, validators, aspects, and operation
  preflight hooks.
- Added conflict-aware persistence helpers and a React hook for revision-token-backed storage.
- Added adoption documentation for adapters, persistence, commands, runtime selection,
  collaboration, patches, plugins, and conflict-aware persistence.
- Compatibility: `EditorPersistenceState` can now carry `revisionToken` and `conflict` when
  conflict-aware persistence is used; those fields are optional for consumers that construct state
  objects manually.

## 0.1.1

- Added multi-attempt best-of benchmark baseline checks to reduce noisy local and CI performance
  regressions.
- Updated release documentation for post-`0.1.0` npm publishes and trusted publishing from CI.
- Added Node 18 package-consumer smoke coverage for the minimum supported runtime version.

## 0.1.0

- Initial public package shape for headless editor infrastructure.
- Added tree projection, snapshot and transaction history, command and hotkey helpers, JSON serialization, browser helpers, share tokens, aspects, and React hooks.
- Added runtime document persistence helpers and an optional React autosave hook.
- Kept React helpers isolated behind the `/react` subpath so the root entrypoint stays headless.
