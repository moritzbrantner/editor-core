# Contributing

## Local Setup

Use the pinned package manager from `package.json`:

```sh
bun install --frozen-lockfile
```

## Validation

Run the full local gate before opening a pull request:

```sh
bun run verify
```

Focused checks:

```sh
bun run format:check
bun run lint
bun run check-types
bun run test:unit
bun run test:integration
bun run test:e2e
bun run test:storybook
bun run api:check
```

## Public API Changes

The package has a generated declaration snapshot in `docs/api-report.md`.

After an intentional public API change, run:

```sh
bun run api:update
```

Review the resulting diff before committing.

## Releases

`docs/release.md` describes the release model. The package is not published to npm; consumers pin
a commit from `main` as a git dependency, and the `prepare` script builds `dist` during that
install. Record changes in `CHANGELOG.md` under `Unreleased` and run `bun run verify:release`
before merging public package changes.
