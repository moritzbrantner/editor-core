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

## Release Checklist

1. Run `bun run verify`.
2. Update `CHANGELOG.md`.
3. Confirm `package.json` has the intended version.
4. Run `bun run pack:check` and inspect the package contents.
5. Publish with provenance from CI or with an npm token that is scoped to this package.
