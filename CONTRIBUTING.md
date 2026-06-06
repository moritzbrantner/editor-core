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

The current release path is manual npm publishing. CI is validation-only and does not publish the
package.

1. Update `CHANGELOG.md`.
2. Confirm `package.json` has the intended version.
3. Push `main` and wait for GitHub validation to pass.
4. Run the manual release sequence:

   ```sh
   git status --short --branch
   bun install --frozen-lockfile
   npm whoami
   bun run verify:release
   npm pack --dry-run --json
   npm publish --dry-run --access public
   npm publish --access public
   ```

   npm may prompt for a one-time password if two-factor authentication is enabled.

5. Create and push the matching release tag after npm publish succeeds.
