# Release Checklist

Use this checklist for npm releases of `@moritzbrantner/editor-core`.

## Before Tagging

1. Confirm the changelog has an entry for the version, including any breaking changes while the
   package is in `0.x`.
2. Run the fast local gate:

   ```sh
   bun run verify:fast
   ```

3. Run the release gate before publishing:

   ```sh
   bun run verify:release
   ```

4. If public types changed intentionally, update and review the API report:

   ```sh
   bun run api:update
   ```

5. Confirm package exports and tarball contents:

   ```sh
   bun run smoke:package
   bun run pack:check
   ```

6. If benchmark changes are intentional, run `bun run bench` several times, update
   `docs/performance-baselines.json`, and include before/after output in the pull request.

## Publishing

1. Publish with npm provenance from CI when possible.
2. Verify the npm package page shows the intended version, repository, license, and README.
3. Create or push a matching git tag after the package is published.
4. Confirm a clean install can import the root package and the `/react` subpath.

## After Publishing

1. Check the GitHub release or tag notes match the changelog.
2. Confirm the deployed React example still builds and loads after the release workflow runs.
3. Open a follow-up issue for any deferred compatibility, benchmark, or API-report work.
