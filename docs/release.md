# Releases

`@moenarch/editor-core` is not published to npm for now. Versions already on npm stay there and are
not unpublished; there is no publish workflow and no npm token or trusted-publisher setup.

## Consuming

Consumers install a commit-pinned git dependency and list it in `trustedDependencies`, so bun runs
the package's `prepare` script:

```json
{
  "dependencies": {
    "@moenarch/editor-core": "git+https://github.com/moritzbrantner/editor-core.git#<commit-sha>"
  },
  "trustedDependencies": ["@moenarch/editor-core"]
}
```

`scripts/prepare-git-install.ts` builds `dist` only when the package sits below `node_modules`; in a
normal checkout it does nothing. `bun run verify:git-install` installs the current pushed commit in
a scratch consumer and checks every export target, and CI runs it in package validation.

## Changes and versions

- Record notable changes in `CHANGELOG.md` under `Unreleased`, calling out every breaking change.
- A commit on `main` is the release. Bump `package.json`'s version only when consumers benefit from
  a named version; while the package is `0.x`, breaking changes may land in minor versions.
- Update `docs/api-report.md` (`bun run api:update`) for intentional public type changes and
  `docs/performance-baselines.json` only for verified benchmark changes.

Run the release gate before merging public package changes:

```sh
bun install --frozen-lockfile
bun run verify:release
```
