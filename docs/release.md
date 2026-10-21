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

## Clean-consumer fixtures

`bun run test:consumers` builds and packs the package, then installs the tarball into fresh
temporary apps from `fixtures/clean-consumers/` (no workspace or sibling aliases) and runs each
fixture's `check` script:

| Fixture          | Proves                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `core-node`      | Every non-React subpath imports under Node with React and the JSX runtime blocked and no DOM              |
| `react-library`  | A TypeScript React library compiles against the packed types and renders a controlled editor              |
| `vite-react`     | Vite builds a client bundle and SSR-renders a controlled editor                                           |
| `next`           | Next.js App Router builds and prerenders a server page using core entrypoints with a client editor island |
| `tauri-frontend` | The Tauri (frontend-only) Vite build bundles a session-backed editor for the WebView targets              |

Before each check a dependency assertion fails on a second copy of `@moenarch/editor-core` (or of
the UI package) anywhere in the tree and on npm-reported invalid or missing peers of either.
Install, build and check output is kept in `test-results/clean-consumers/<fixture>.log`, which CI
uploads when the job fails. Useful flags: `--only next,core-node`, `--tarball <candidate.tgz>`
to check an existing release candidate, `--keep` to keep the temporary apps.
