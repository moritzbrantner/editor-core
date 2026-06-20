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
