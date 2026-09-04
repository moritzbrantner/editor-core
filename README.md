# @moenarch/editor-core

Headless, domain-neutral editing mechanics for editor packages.

`editor-core` owns the machinery that remains useful when the edited document changes completely: runtime state, undo/redo, semantic operations, commands, persistence, generic entity/tree helpers, generic 2D viewport math, serialization, and optional React bindings.

It intentionally does **not** define graph, workflow, timeline, media, or collaboration semantics. Those belong to the specialization that owns them.

## Install

```sh
bun add @moenarch/editor-core
```

The root entrypoint is framework-free. React helpers are available from `@moenarch/editor-core/react`.

## Intended dependency shape

```text
                 editor-core
               generic mechanics
                /            \
               /              \
       graph-editor       timeline-editor
            |
     workflow-editor
```

A product should normally consume the specialization it needs rather than reaching through it into `editor-core`.

## What belongs here

Good `editor-core` responsibilities:

- arbitrary caller-owned document and selection state
- revision and dirty-state tracking
- snapshot or transaction history
- semantic operation application and merged interaction transactions
- undo/redo and command plumbing
- generic validation/preflight hooks
- persistence/autosave lifecycle and revision tokens
- generic entity identity/hierarchy helpers
- generic tree projections
- generic 2D pan/zoom, bounds, and scalar/point snapping
- stable JSON, patches, serialization helpers, and adapter tests
- optional React bindings around the same headless mechanics

Responsibilities that do **not** belong here:

- nodes, edges, ports, or graph connection rules
- workflows, DAG semantics, or execution
- tracks, clips, time ranges, trimming, or playback
- media processing
- presence, collaborative editing protocols, or remote-operation transport

A useful test for a proposed core API is: **would it still make sense for an editor whose document is `{ text: string }` and whose selection is `{ start: number; end: number }`?** If not, it probably belongs to a specialization.

## Main entrypoints

| Import path             | Purpose                                                         |
| ----------------------- | --------------------------------------------------------------- |
| `@moenarch/editor-core` | Headless generic kernel exports                                 |
| `/runtime`              | Document runtime, selection, validation, revisions, dirty state |
| `/operations`           | Semantic operations, merged transactions, undo/redo             |
| `/history`              | Snapshot and transaction history helpers                        |
| `/commands`             | Command definitions, runtime policy, diagnostics                |
| `/persistence`          | Load/save, autosave, conflicts, revision tokens                 |
| `/entities`             | Generic entity IDs, hierarchy, bounds, ID helpers               |
| `/indexes`              | Generic entity hierarchy and validation indexes                 |
| `/selection`            | Generic entity/range selection helpers                          |
| `/tree`                 | Adapter-driven tree projection and UI state                     |
| `/viewport`             | Generic 2D viewport/bounds/snap math                            |
| `/serialization`        | Versioned document envelopes and migrations                     |
| `/patches`              | Immutable JSON diff/apply/invert helpers                        |
| `/json`                 | Stable JSON helpers                                             |
| `/hotkeys`              | Shortcut parsing/matching/conflict detection                    |
| `/interaction`          | Transient interaction-session helpers                           |
| `/browser`              | Browser file/clipboard/storage helpers                          |
| `/plugins`              | Composition of generic commands/validators/aspects              |
| `/aspects`              | Derived document values                                         |
| `/testing`              | Adapter contract checks                                         |
| `/react`                | Optional React hooks                                            |

## Runtime

The generic runtime does not know the shape of either the document or the selection:

```ts
import { commitEditorRuntime, createEditorRuntime } from "@moenarch/editor-core/runtime";

type Document = { title: string };
type Selection = { start: number; end: number };

let runtime = createEditorRuntime<Document, Selection>({
  initialDocument: { title: "Draft" },
  initialSelection: { start: 0, end: 0 },
  validate(document) {
    return document.title.trim() ? [] : [{ path: "title", message: "Title is required." }];
  },
});

runtime = commitEditorRuntime(runtime, { title: "Published" });
```

Runtime state is opaque. Persist documents, not runtime objects.

## Semantic operations

Use the operation runtime when edits need labels, selection restoration, preflight checks, or repeated pointer/key interactions merged into one undo step:

```ts
import {
  applyEditorInteractionOperation,
  createEditorOperationRuntime,
  undoEditorOperationRuntime,
} from "@moenarch/editor-core/operations";

let editor = createEditorOperationRuntime({
  initialDocument: { items: { a: { x: 0 } } },
});

editor = applyEditorInteractionOperation(editor, {
  id: "move-a",
  mergeKey: "move:a",
  apply: (document) => ({ items: { a: { x: 20 } } }),
});

editor = undoEditorOperationRuntime(editor);
```

The caller defines what an operation means. Graph connection validation, timeline trimming rules, workflow cardinality, and similar semantics remain outside core and plug into generic `preflight`/`validate` hooks.

## Persistence

Persistence coordinates arbitrary documents with load/save/autosave state. Revision tokens belong to persistence and may be used for stale-save conflict detection; they do not imply collaborative editing.

```ts
import {
  createEditorRuntimePersistenceController,
  createEditorPersistenceState,
} from "@moenarch/editor-core/persistence";
```

## Generic 2D helpers

`viewport` deliberately stops at ordinary 2D coordinate and snapping mechanics. Time-to-pixel conversion belongs in a timeline package; graph routing belongs in a graph package.

```ts
import {
  createEditorViewportState,
  screenPointToEditorPoint,
  zoomEditorViewportAtPoint,
} from "@moenarch/editor-core/viewport";
```

## Domain specialization

Downstream packages should wrap core mechanics with their own vocabulary instead of pushing that vocabulary upward.

For example, `timeline-editor` may expose `TimelineEditorHistory` backed by generic transaction history, while still owning tracks, clips, ranges, snapping rules, playback, and timeline selection. `graph-editor` may use generic operation/runtime and 2D helpers while owning nodes, edges, ports, graph indexes, and connection validation.

Small adapters at these seams are intentional. A little duplication in a specialization is cheaper than creating a universal editor ontology.

## Development

```sh
bun install --frozen-lockfile
bun run verify:fast
bun run verify:release
```

Public API changes update `docs/api-report.md` with:

```sh
bun run api:update
```
