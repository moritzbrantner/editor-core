# TypeScript Architecture

`@moenarch/editor-core` is a domain-neutral editor kernel. It owns reusable editing mechanics while downstream specializations own their document semantics.

The root entrypoint is headless. React stays behind `@moenarch/editor-core/react`.

## Boundary

Core may own:

- arbitrary caller-owned document and selection state
- runtime revision, dirty state, validation plumbing, and derived aspects
- snapshot/transaction history and semantic-operation execution
- command/hotkey plumbing
- persistence/autosave and revision-token conflict handling
- generic entity identity/hierarchy, tree projection, and generic 2D viewport helpers
- JSON/patch/serialization/testing mechanics

Core must not define:

- graph nodes, edges, ports, connection rules, or graph indexes
- workflow/DAG semantics
- timeline tracks, clips, time ranges, time selection, or time-to-pixel math
- media processing
- collaboration presence, remote-operation protocols, or synchronization transports

These belong in `graph-editor`, `workflow-editor`, `timeline-editor`, or the eventual product.

## Dependency Shape

The intended specialization graph is:

```text
                 editor-core
               generic mechanics
                /            \
               /              \
       graph-editor       timeline-editor
            |
     workflow-editor
```

`workflow-editor` may specialize `graph-editor`; `timeline-editor` should not depend on `graph-editor`. Products compose the specializations at the application boundary.

## Public Entrypoints

Package subpaths in `package.json` are public contracts. Domain-specific subpaths are not added to core merely to make multiple editor families look uniform.

Split implementation domains are currently:

- `runtime`
- `operations`
- `persistence`
- `react`

Small compatibility entrypoints at `src/<domain>.ts` or `src/<domain>.tsx` re-export the implementation domain.

## Internal Dependency Rules

Implementation is grouped by capability rather than generic technical layers. Same-domain files may use relative imports. Cross-domain value imports should use the other domain's public entrypoint.

No source file under `src/` should self-import `@moenarch/editor-core`, and no source file should import from `src/index.ts`.

Foundation domains should stay dependency-light: `json`, `entities`, `history`, `hotkeys`, `aspects`, `tree`, and `browser`.

The allowed value dependency graph is encoded in `scripts/architecture-rules.mjs`.

React rules:

- `react` and `react-dom` imports are allowed only inside the `react` domain.
- `src/index.ts` must never export `./react.js`.
- examples, stories, and tests may import the public React subpath.

## Promotion Rule

Do not move a specialization helper into core merely because two packages have similarly named code. Promote it only when multiple consumers need substantially the same semantics.

A quick test for proposed core APIs: would the abstraction still make sense for an editor whose document is `{ text: string }` and whose selection is `{ start: number; end: number }`? If the explanation requires ports, tracks, clips, workflows, or media, it does not belong in core.

## File Size Signals

Implementation files over 300 lines are reported as split candidates. Implementation files over 500 lines fail `architecture:check`.

Compatibility entrypoints for split domains must remain small re-export files.

## Commands

```sh
bun run architecture:report
bun run architecture:check
bun run api:check
```

Run `bun run api:update` after intentional public API changes and review the generated declaration diff as release evidence.
