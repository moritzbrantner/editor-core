# TypeScript Architecture

This package keeps public import paths stable while implementation code is divided by editor
capability. The root entrypoint is headless; React stays behind
`@moenarch/editor-core/react`.

## Public Entrypoints

Package subpaths in `package.json` are compatibility contracts. A refactor may move implementation
behind a subpath, but the subpath itself should remain available unless an intentional public API
change goes through the API report and changelog flow.

Split domains use a small compatibility file at `src/<domain>.ts` or `src/<domain>.tsx` that only
re-exports from `src/<domain>/index.ts`.

Current split domains:

- `runtime`
- `operations`
- `persistence`
- `react`
- `sync`

## Domain Boundaries

Implementation code is grouped by editor capability, not by generic layers. Same-domain files may
use deep relative imports. Cross-domain imports should use the other domain's public entrypoint.

Good:

```ts
import { createEditorRuntime } from "../runtime.js";
```

Avoid:

```ts
import { createEditorRuntime } from "../runtime/state.js";
```

No source file under `src/` should self-import `@moenarch/editor-core`, and no source file
should import from `src/index.ts`.

## Dependency Direction

Foundation domains should stay dependency-light: `json`, `entities`, `history`, `hotkeys`,
`aspects`, `tree`, `collaboration`, `share`, and `browser`.

Value imports must follow the graph encoded in `scripts/architecture-rules.mjs`. Type-only imports
may be broader when they do not create cycles or leak React into the headless package.

React rules:

- `react` and `react-dom` imports are allowed only inside the `react` domain.
- `src/index.ts` must never export `./react.js`.
- Examples, stories, and tests may import the package's public React subpath.

## File Size Signals

Implementation files over 300 lines are reported as split candidates. Implementation files over
500 lines fail `architecture:check`.

Public compatibility entrypoints for split domains must remain under 80 lines and contain only
re-exports.

## Commands

Use the non-blocking report while refactoring:

```sh
bun run architecture:report
```

The CI gate uses:

```sh
bun run architecture:check
```

After public API changes, continue to use:

```sh
bun run api:check
```
