# Changelog

All notable changes to `@moritzbrantner/editor-core` are documented here.

This package follows semver. While the package is in `0.x`, breaking changes may ship in minor releases, but every breaking change must be called out in this file.

## Unreleased

_No unreleased changes._

## 0.1.0

- Initial public package shape for headless editor infrastructure.
- Added tree projection, snapshot and transaction history, command and hotkey helpers, JSON serialization, browser helpers, share tokens, aspects, and React hooks.
- Added runtime document persistence helpers and an optional React autosave hook.
- Kept React helpers isolated behind the `/react` subpath so the root entrypoint stays headless.
