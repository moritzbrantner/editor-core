# Release Checklist

Use this checklist for npm releases of `@moenarch/editor-core`.

## Release Model

This repository uses an agent-driven, tag-triggered npm release flow after the first
`@moenarch/editor-core` package has been published:

1. A coding agent bumps `package.json`, updates `CHANGELOG.md`, runs release validation, commits,
   and pushes to `main`.
2. The agent creates and pushes an annotated `v<version>` tag from the release commit.
3. `.github/workflows/publish.yml` verifies the tag, changelog, npm CLI support, and npm registry
   state before publishing.
4. GitHub Actions publishes to npm through npm Trusted Publishing.

The workflow intentionally does not use a GitHub Environment approval gate. The release security
boundary is repository write access, `v*` tag creation rights, and npm's trusted publisher binding
to this repository and workflow.

## Bootstrap `@moenarch/editor-core`

The first `@moenarch/editor-core` release must be published manually because npm Trusted
Publishing can only be configured after the package exists on npm.

For the scope migration release:

- Package: `@moenarch/editor-core`
- Version: `0.4.0`
- Publish command: `npm publish --access public`
- Tag: `v0.4.0`

Before the first publish, confirm the package name is still available:

```sh
npm view @moenarch/editor-core version dist-tags --json
```

An `E404` response means the package has not been published yet.

After publishing `@moenarch/editor-core@0.4.0`, configure npm Trusted Publishing for future
versions and then create the matching source tag:

```sh
git tag -a v0.4.0 -m "@moenarch/editor-core v0.4.0"
git push origin v0.4.0
```

The `Release` workflow intentionally skips the publish job for `v0.4.0`; that tag is only for
source traceability after the manual bootstrap publish. Later `v*` tags publish through Trusted
Publishing.

The old package should be deprecated only after `@moenarch/editor-core@0.4.0` has been verified:

```sh
npm deprecate @moritzbrantner/editor-core "Package moved to @moenarch/editor-core. Install @moenarch/editor-core instead."
```

## npm Trusted Publishing Setup

Configure npm Trusted Publishing for `@moenarch/editor-core` after the bootstrap publish and before
using the workflow for later versions:

- Provider: GitHub Actions
- Organization/user: `moritzbrantner`
- Repository: `editor-core`
- Workflow filename: `publish.yml`
- Environment name: leave blank
- Allowed action: `npm publish`

Do not add an `NPM_TOKEN` secret for the normal release path. The publish job uses GitHub OIDC via
the workflow's `id-token: write` permission.

npm Trusted Publishing requires a supported Node and npm CLI on the runner. The publish workflow
uses Node 24 and fails before publishing if `npm --version` is older than `11.5.1`.

## GitHub Setup

The coding agent identity must be allowed to:

- Push release commits to `main`.
- Create and push tags matching `v*`.
- Read GitHub Actions results.
- Create GitHub Releases if release notes are added later.

Recommended repository rules:

- Keep required CI on pull requests if branch protection is enabled.
- If direct pushes to `main` are blocked, add only the agent identity to the bypass list.
- If tag rules protect `v*`, allow only maintainers and the agent identity to create matching tags.
- Consider CODEOWNERS coverage for `.github/workflows/*` if workflow changes should still be
  reviewed separately.

## Version Target

Every release must use a version that does not already exist on npm.

Check the current npm state before choosing the next version:

```sh
npm view @moenarch/editor-core version dist-tags --json
```

While the package is in `0.x`, breaking public API changes may ship in minor releases, but every
breaking change must be called out in `CHANGELOG.md`.

Use this version policy:

- Patch: fixes and compatible internal changes.
- Minor: new public APIs, and breaking public API changes while the package is `0.x`.
- Major: breaking public API changes after `1.0.0`.

## Canonical Dependency Train

The supported editor dependency contract is:

- `@moenarch/editor-core: ^0.4.1`
- `@moritzbrantner/ui: ^1.1.0`

Do not use the legacy `@moritzbrantner/editor-core` package, a sibling `file:` dependency, or a
moving Git dependency in a release manifest. Local `file:` references are permitted only inside
the disposable consumers described below.

### Inventory and Release Targets

| Package                           | Published |     Train target | Release role                          |
| --------------------------------- | --------: | ---------------: | ------------------------------------- |
| `@moenarch/editor-core`           |   `0.4.1` |          `0.4.1` | Canonical Core; already published     |
| `@moritzbrantner/editor-core`     |   `0.3.0` | Deprecation only | Legacy Core; no compatibility release |
| `@moritzbrantner/ui`              |   `1.1.0` |          `1.1.0` | Supported UI compatibility floor      |
| `@moritzbrantner/graph-editor`    |   `0.2.0` |          `0.2.1` | Direct canonical-Core consumer        |
| `@moritzbrantner/workflow-editor` |   `0.1.1` |          `0.1.2` | Follows Graph `0.2.1`                 |
| `@moritzbrantner/timeline-editor` |   `1.0.1` |          `1.0.2` | Direct canonical-Core consumer        |

Implementation and release readiness are owned by the downstream PRDs:

- [Graph Editor: canonical Core and UI 1.1](https://github.com/moritzbrantner/graph-editor/issues/2)
- [Workflow Editor: aligned Graph and UI train](https://github.com/moritzbrantner/workflow-editor/issues/25)
- [Timeline Editor: canonical Core and UI 1.1](https://github.com/moritzbrantner/timeline-editor/issues/13)

### Clean-Consumer Contract

Every downstream release must use its repository-owned package and release checks first. It must
then pass the following clean consumers twice:

1. **Before publication:** install exact `.tgz` artifacts, never workspace directories or
   non-exact dependency ranges.
2. **After publication:** recreate the same consumer from an empty directory and install the
   published npm versions.

Use a new temporary directory for every check and preserve the successful command output and
tarball checksums in the release record. Generate each unpublished artifact from its exact release
commit with `npm pack`; obtain already-published fixed inputs with `npm pack <name>@<version>`.

```sh
RELEASE_TARBALLS=$(mktemp -d)
npm pack --pack-destination "$RELEASE_TARBALLS"
sha256sum "$RELEASE_TARBALLS"/*.tgz
```

`RELEASE_TARBALLS` must be an absolute path outside every package repository. Never commit this
directory or any temporary `file:` dependency.

The consumer sets are:

| Consumer | Exact-tarball inputs before publish                       | npm entry point after publish |
| -------- | --------------------------------------------------------- | ----------------------------- |
| Graph    | Core `0.4.1`, UI `1.1.0`, Graph `0.2.1`                   | Graph `0.2.1`                 |
| Timeline | Core `0.4.1`, UI `1.1.0`, Timeline `1.0.2`                | Timeline `1.0.2`              |
| Workflow | Core `0.4.1`, UI `1.1.0`, Graph `0.2.1`, Workflow `0.1.2` | Workflow `0.1.2`              |

For the pre-publish check, create the consumer and install the absolute tarball paths:

```sh
consumer_dir=$(mktemp -d)
cd "$consumer_dir"
npm init -y
npm install --save-exact \
  "$RELEASE_TARBALLS/<core-tarball>.tgz" \
  "$RELEASE_TARBALLS/<ui-tarball>.tgz" \
  "$RELEASE_TARBALLS/<package-tarball>.tgz"
npm ls --all
```

The Workflow consumer adds the exact Graph tarball as well. Run the downstream repository's
clean-consumer import and dependency-tree assertion against this directory. It must prove that the
package imports successfully, exactly one `@moenarch/editor-core` implementation is resolved,
exactly one compatible `@moritzbrantner/ui` is resolved, and no
`@moritzbrantner/editor-core` package is installed.

After publishing, delete the first consumer and repeat the same assertion in another empty
directory using npm:

```sh
consumer_dir=$(mktemp -d)
cd "$consumer_dir"
npm init -y
npm install --save-exact "<package-name>@<target-version>"
npm ls --all
```

Install only the released Graph, Workflow, or Timeline entry point in this phase so that npm
resolves its declared dependency ranges. The resolved tree must satisfy the canonical Core, UI,
and (for Workflow) Graph ranges. A publish is not complete until this npm-installed consumer
passes the same import and dependency-tree assertion used for the tarballs.

### Release Sequence and Gates

1. Build the Graph `0.2.1` and Timeline `1.0.2` release commits. Each may validate independently
   against exact Core `0.4.1` and UI `1.1.0` tarballs.
2. Publish Graph `0.2.1` only after its exact-tarball consumer and repository release checks pass.
   Recreate its clean consumer with npm-installed exact versions and require it to pass.
3. Build and validate Workflow `0.1.2` only after Graph `0.2.1` is available as its exact packed or
   published dependency. Publish Workflow only after its four-artifact consumer passes, then run
   the npm-installed consumer.
4. Publish Timeline `1.0.2` whenever its independent pre-publish gate passes, then run its
   npm-installed consumer. Timeline does not wait for Graph or Workflow.
5. Deprecate legacy Core only after both the Workflow and Timeline post-publish npm consumer checks
   are recorded as passing:

   ```sh
   npm deprecate @moritzbrantner/editor-core \
     "Package moved to @moenarch/editor-core. Install @moenarch/editor-core instead."
   ```

This gate is intentionally later than publication of Graph. Do not publish a compatibility shim
or another legacy-Core version.

### Dependency-Train Rollback

Stop the train at the first failed repository, tarball-consumer, publish, or npm-consumer check.
Do not deprecate legacy Core while any downstream post-publish gate is incomplete or failing.

- **Before npm accepts a package:** fix the owning repository, regenerate every affected tarball
  from a new clean release commit, rerun the exact-tarball consumer, and resume from that package.
- **After npm accepts a package:** never overwrite or republish the version. Deprecate only the
  broken downstream version with a reason, prepare the next patch version, and rerun both consumer
  gates. Update dependent unpublished packages to the corrected exact version before continuing.
- **If Graph fails or is replaced:** pause Workflow. Rebuild and revalidate Workflow against the
  corrected Graph tarball/version; do not release Workflow against Graph `0.2.0`.
- **If Workflow or Timeline fails post-publish:** leave `@moritzbrantner/editor-core` undeprecated,
  fix forward with a patch, and repeat that package's npm-installed clean consumer.

Rollback must preserve the canonical contract: one `@moenarch/editor-core` at `^0.4.1`, UI at
`^1.1.0`, and no legacy-Core shim, sibling `file:` manifest entry, or moving Git dependency.

## Agent Release Procedure

Run the release from `main`:

```sh
git checkout main
git pull --ff-only origin main
git status --short
```

Inspect unreleased changes, choose the bump, and confirm the current npm registry state. For the
bootstrap release, `@moenarch/editor-core` should return `E404`; later releases should return the
current published version and dist-tags.

```sh
npm view @moenarch/editor-core version dist-tags --json
```

Update:

- `package.json` with the intended new version.
- `CHANGELOG.md` with an entry for the exact same version.
- `docs/api-report.md` if public type changes are intentional.
- `docs/performance-baselines.json` only when benchmark changes are intentional and verified.

Run the local release gate from the release commit:

```sh
bun install --frozen-lockfile
bun run verify:release
npm pack --dry-run --json
npm publish --dry-run --access public
```

Commit and push:

```sh
git add package.json CHANGELOG.md docs/api-report.md docs/performance-baselines.json
git commit -m "Release v<version>"
git push origin main
```

Create and push the matching annotated tag:

```sh
git tag -a v<version> -m "@moenarch/editor-core v<version>"
git push origin v<version>
```

Watch the `Release` workflow. After it succeeds, verify the published package:

```sh
npm view @moenarch/editor-core@<version> version repository license dist-tags --json
```

Confirm a clean install can import the root package and the `/react` subpath.

## Workflow Guards

The `Release` workflow fails before `npm publish` when:

- The tag is not exactly `v<package.json version>`.
- `CHANGELOG.md` lacks a `## <version>` or `## [<version>]` entry.
- `npm --version` is older than `11.5.1`.
- The exact package version already exists on npm.
- The repository validation or release validation jobs fail.

For the bootstrap `v0.4.0` tag, the publish job is skipped because the package must already have
been manually published before npm Trusted Publishing can be configured.

## crates.io

There is no Rust crate in this repository today, so the release workflow does not publish to
crates.io.

If a Rust crate is added later:

1. Publish the first crate version manually if the crate does not already exist on crates.io.
2. Configure crates.io Trusted Publishing for each crate:
   - GitHub owner: `moritzbrantner`
   - Repository: `editor-core`
   - Workflow filename: `publish.yml`, or a dedicated future Rust release workflow
   - Environment: leave blank
3. Add a Rust publish job that uses `rust-lang/crates-io-auth-action@v1`.
4. Pass the action output as `CARGO_REGISTRY_TOKEN` to `cargo publish`.

Use crates.io Trusted Publishing instead of long-lived API tokens whenever possible.

## Manual npm Fallback

Use manual npm publishing for `@moenarch/editor-core@0.4.0`, or later only when Trusted Publishing
is unavailable and the package version has not been published yet.

1. Run the full local release gate.
2. Publish manually:

   ```sh
   npm publish --access public
   ```

3. Verify the package:

   ```sh
   npm view @moenarch/editor-core@<version> version repository license dist-tags --json
   ```

4. Create and push the matching tag from the exact release commit:

   ```sh
   git tag -a v<version> -m "@moenarch/editor-core v<version>"
   git push origin v<version>
   ```

## Failure Handling

- If the version is already published, bump to the next appropriate patch, minor, or major version,
  update `CHANGELOG.md`, rerun the release gate, and push a new release commit and tag.
- If the trusted publish fails before npm accepts the package, fix the workflow or registry setup
  and rerun the same tag after confirming npm does not have the version.
- If npm accepts the package but a later workflow step fails, do not republish the same version.
  Fix forward with a new version if the package contents are wrong.
- If tag creation fails after a manual publish, create and push the `v<version>` tag from the exact
  commit that produced the published package.
