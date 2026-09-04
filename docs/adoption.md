# Adoption Guide

Use `@moenarch/editor-core` when a downstream editor needs shared editing mechanics. Keep the downstream document model and domain rules in the package that owns them.

## Minimal runtime

```ts
import {
  commitEditorRuntime,
  createEditorRuntime,
  createEditorRuntimeCommands,
} from "@moenarch/editor-core/runtime";

type Document = {
  body: string;
  title: string;
};

type Selection = {
  start: number;
  end: number;
};

let runtime = createEditorRuntime<Document, Selection>({
  initialDocument: { body: "", title: "Draft" },
  initialSelection: { start: 0, end: 0 },
  validate(document) {
    return document.title.trim() ? [] : [{ path: "title", message: "Title is required." }];
  },
});

runtime = commitEditorRuntime(runtime, ({ document }) => ({
  ...document,
  title: "Release Notes",
}));

const commands = createEditorRuntimeCommands({
  getResetDocument: () => ({ body: "", title: "Draft" }),
  runtime,
  setRuntime(updater) {
    runtime = updater(runtime);
  },
});
```

Runtime state is opaque. Persist documents, not runtime state.

Use snapshot history for small immutable documents. Use operation runtime when edits need semantic labels, selection restoration, preflight checks, or interaction merging.

## Semantic operations

```ts
import {
  applyEditorInteractionOperation,
  createEditorOperationRuntime,
} from "@moenarch/editor-core/operations";

let editor = createEditorOperationRuntime({
  initialDocument: { items: { a: { x: 0 } } },
  preflight({ operation }) {
    // Domain validation belongs here or in the specialization.
    return operation.id === "forbidden" ? [{ path: "items.a", message: "Forbidden" }] : [];
  },
});

editor = applyEditorInteractionOperation(editor, {
  id: "move-a",
  mergeKey: "move:a",
  apply: (document) => ({ items: { a: { x: 20 } } }),
});
```

`editor-core` owns the transaction behavior. The consumer owns what `move-a`, a valid graph connection, or a valid timeline trim actually means.

## Persistence

Storage adapters load and save caller-owned documents. Runtime history and transient selection state are rebuilt around loaded documents.

```ts
import {
  createEditorPersistenceState,
  createEditorRuntimePersistenceController,
} from "@moenarch/editor-core/persistence";

let persistence = createEditorPersistenceState();

const controller = createEditorRuntimePersistenceController({
  autosave: { delayMs: 750, retry: { attempts: 1, delayMs: 1500 }, saveLatest: true },
  getPersistence: () => persistence,
  getRuntime: () => runtime,
  setPersistence: (next) => {
    persistence = typeof next === "function" ? next(persistence) : next;
  },
  setRuntime: (next) => {
    runtime = typeof next === "function" ? next(runtime) : next;
  },
  storage,
});
```

Revision tokens belong to persistence for stale-save detection. They do not imply presence, collaborative editing, or a synchronization protocol.

## Serialization

Use a document adapter only when the document actually crosses a persistence/export boundary.

```ts
import type { EditorDocumentAdapter } from "@moenarch/editor-core/serialization";

const adapter: EditorDocumentAdapter<Document> = {
  format: "@example/editor/document",
  schemaVersion: 1,
  normalize: (document) => document,
  read: (input) => input as Document,
};
```

Internal, non-persisted shapes do not need migration machinery merely because they are TypeScript types.

## Generic entities and trees

The entity helpers are optional. Use them when a consumer has stable IDs and hierarchy, without requiring the consumer to adopt a universal editor document.

```ts
import { createEditorEntityDocument } from "@moenarch/editor-core/entities";
import { createEditorEntityIndexes } from "@moenarch/editor-core/indexes";

const entities = createEditorEntityDocument([
  { id: "a", type: "item", order: 1 },
  { id: "b", type: "item", order: 2 },
]);
const indexes = createEditorEntityIndexes(entities);
```

Graph edges, workflow nodes, timeline clips, tracks, ports, and time ranges should be modeled in their owning packages rather than added to these generic types.

## Generic 2D viewport

The viewport helpers provide ordinary 2D pan/zoom, bounds, and scalar/point snapping.

```ts
import {
  createEditorViewportState,
  screenPointToEditorPoint,
  zoomEditorViewportAtPoint,
} from "@moenarch/editor-core/viewport";
```

Timeline time-to-pixel math belongs in `timeline-editor`. Graph routing and connection geometry belong in `graph-editor`.

## React

React integration remains optional:

```ts
import { usePersistentEditorRuntime } from "@moenarch/editor-core/react";
```

The React layer wraps the same headless kernel; it does not own product UI or domain chrome.

## Specialization guidance

A specialization should expose its own vocabulary even when core supplies the mechanics underneath it.

Examples:

- `graph-editor` owns nodes, edges, ports, graph indexes, graph connection validation, and graph selection.
- `workflow-editor` owns workflow node kinds, typed workflow ports, DAG/workflow rules, templates/composition, and compilation.
- `timeline-editor` owns tracks, clips/items, time ranges, trim/ripple/roll/slip behavior, playback, and temporal selection.

Thin wrappers around generic history/runtime/operations are healthy seams. Do not eliminate them solely to reduce code duplication.

## When not to extend core

Before adding a public core abstraction, ask whether substantially the same behavior is already required by multiple independent editor specializations.

If the proposed API requires explaining nodes, ports, tracks, clips, workflows, media, or collaboration, keep it downstream until evidence says otherwise.
