# Release Checklist

Use this checklist for npm releases of `@moritzbrantner/editor-core`.

## Release Target

Choose the next version before publishing. The package is already published on npm, so every
release must use a version that does not already exist on the registry.

For the next release, use `0.2.0` because the current changes add public APIs. npm `latest` was
checked as `0.1.0` on June 7, 2026.

Before tagging or publishing, confirm the current npm state:

```sh
npm view @moritzbrantner/editor-core version dist-tags --json
```

Verify the registry state again immediately before publishing.

While the package is in `0.x`, breaking changes may ship in minor releases, but every breaking
change must be called out in `CHANGELOG.md`.

## Before Publishing

Run the local verification sequence from the release commit:

```sh
git status --short --branch
bun install --frozen-lockfile
npm whoami
npm view @moritzbrantner/editor-core version dist-tags --json
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

3. Confirm the active npm account and registry state:

   ```sh
   npm whoami
   npm view @moritzbrantner/editor-core version dist-tags --json
   ```

4. Confirm `package.json` has the intended new version and that the version is not already
   published.
5. Confirm `CHANGELOG.md` has an entry for the version, including any breaking changes while the
   package is in `0.x`.
6. Run the release gate before publishing:

   ```sh
   bun run verify:release
   ```

7. If public types changed intentionally, update and review the API report before rerunning the
   release gate:

   ```sh
   bun run api:update
   ```

8. Confirm package exports and tarball contents:

   ```sh
   npm pack --dry-run --json
   npm publish --dry-run --access public
   ```

9. If benchmark changes are intentional, run `bun run bench` several times, update
   `docs/performance-baselines.json`, and include before/after output in the pull request.

## Trusted Publishing

The preferred release path is npm trusted publishing from GitHub Actions.

Before the first trusted publish, configure npm trusted publishing for
`.github/workflows/release.yml` and the `npm` GitHub environment.

1. Push `main`:

   ```sh
   git push origin main
   ```

2. Wait for the `Validate` workflow on `main` to pass.
3. Create and push a matching annotated tag from the validated commit:

   ```sh
   git tag -a v<version> -m "@moritzbrantner/editor-core v<version>"
   git push origin v<version>
   ```

4. The `Release` workflow runs the release gate again and publishes with npm provenance:

   ```sh
   npm publish --access public --provenance
   ```

5. Verify the npm package page shows the intended version, repository, license, and dist-tag:

   ```sh
   npm view @moritzbrantner/editor-core@<version> version repository license dist-tags --json
   ```

6. Confirm a clean install can import the root package and the `/react` subpath.

## Manual Publishing Fallback

Use manual publishing only if trusted publishing is unavailable.

1. Push `main` and wait for GitHub validation to pass.
2. Confirm the working tree and branch state:

   ```sh
   git status --short --branch
   ```

3. Publish the package:

   ```sh
   npm publish --access public
   ```

4. Verify the npm package page:

   ```sh
   npm view @moritzbrantner/editor-core@<version> version repository license dist-tags --json
   ```

5. Create and push the matching git tag after the package is published:

   ```sh
   git tag -a v<version> -m "@moritzbrantner/editor-core v<version>"
   git push origin v<version>
   ```

## After Publishing

1. Check the GitHub release or tag notes match the changelog.
2. Confirm the deployed React example still builds and loads after the release workflow runs.
3. Open a follow-up issue for any deferred compatibility, benchmark, or API-report work.

## Failure Handling

- If `npm publish --dry-run` or `npm publish` reports that the version was already published, bump
  to the next appropriate patch or minor version, update `CHANGELOG.md`, rerun the release gate,
  rerun `npm publish --dry-run --access public`, and publish the new version.
- If `npm publish` fails before publishing for any other reason, fix the issue, rerun the release
  gate, rerun `npm publish --dry-run --access public`, and publish again.
- If trusted publishing fails before npm accepts the package, fix the workflow or use the manual
  fallback without changing the version.
- If `npm publish` succeeds but tag creation fails during manual publishing, do not republish.
  Create and push the `v<version>` tag from the exact commit that was published.
- If the published package is broken, do not overwrite the published version. Publish a fixed patch
  version, document the issue in `CHANGELOG.md`, and create a GitHub issue for the release
  incident.
