# Release Checklist

Use this checklist for npm releases of `@moritzbrantner/editor-core`.

## Release Target

The first public npm release is `0.1.0`. Because the package has not been published to npm yet,
do not bump the version just to publish the first release.

## Before Publishing

Run the local verification sequence from the release commit:

```sh
git status --short --branch
bun install --frozen-lockfile
npm whoami
bun run verify:release
npm pack --dry-run --json
npm publish --dry-run --access public
```

npm may prompt for a one-time password if two-factor authentication is enabled.

Detailed checklist:

1. Confirm the working tree and branch state:

   ```sh
   git status --short --branch
   ```

2. Install with the pinned package manager:

   ```sh
   bun install --frozen-lockfile
   ```

3. Confirm the active npm account:

   ```sh
   npm whoami
   ```

4. Confirm the changelog has an entry for the version, including any breaking changes while the
   package is in `0.x`.
5. Run the release gate before publishing:

   ```sh
   bun run verify:release
   ```

6. If public types changed intentionally, update and review the API report before rerunning the
   release gate:

   ```sh
   bun run api:update
   ```

7. Confirm package exports and tarball contents:

   ```sh
   npm pack --dry-run --json
   npm publish --dry-run --access public
   ```

8. If benchmark changes are intentional, run `bun run bench` several times, update
   `docs/performance-baselines.json`, and include before/after output in the pull request.

## Publishing

This repository currently publishes manually. CI validates builds, tests, package exports, package
contents, benchmark baselines, Storybook, e2e behavior, and the React example, but it does not
publish to npm.

1. Push `main`:

   ```sh
   git push origin main
   ```

2. Wait for GitHub validation to pass.
3. Confirm the working tree and branch state:

   ```sh
   git status --short --branch
   ```

4. Publish the package:

   ```sh
   npm publish --access public
   ```

5. Verify the npm package page shows the intended version, repository, license, and README:

   ```sh
   npm view @moritzbrantner/editor-core@0.1.0 version repository license dist-tags --json
   ```

6. Create and push a matching git tag after the package is published:

   ```sh
   git tag -a v0.1.0 -m "@moritzbrantner/editor-core v0.1.0"
   git push origin v0.1.0
   ```

7. Confirm a clean install can import the root package and the `/react` subpath.

Publishing with npm provenance from CI is a future improvement, not the current release path.

## After Publishing

1. Check the GitHub release or tag notes match the changelog.
2. Confirm the deployed React example still builds and loads after the release workflow runs.
3. Open a follow-up issue for any deferred compatibility, benchmark, or API-report work.

## Failure Handling

- If `npm publish` fails before publishing, fix the issue, rerun `bun run verify:release`, rerun
  `npm publish --dry-run --access public`, and publish again.
- If `npm publish` succeeds but tag creation fails, do not republish. Create and push the `v0.1.0`
  tag from the exact commit that was published.
- If the published package is broken, do not overwrite `0.1.0`. Publish a fixed `0.1.1`, document
  the issue in `CHANGELOG.md`, and create a GitHub issue for the release incident.
