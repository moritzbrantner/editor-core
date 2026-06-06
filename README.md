# @moritzbrantner/editor-core

Headless shared infrastructure for Moritz Brantner editor packages.

The root entrypoint is framework-free. React helpers live at
`@moritzbrantner/editor-core/react` so consumers can use the core package without installing
React.

```ts
import { createEditorSnapshotHistory, serializeEditorDocument } from "@moritzbrantner/editor-core";
```

## Install

```sh
npm install @moritzbrantner/editor-core
```

```sh
bun add @moritzbrantner/editor-core
```

For React hooks:

```sh
npm install react @moritzbrantner/editor-core
```

```sh
bun add react @moritzbrantner/editor-core
```

## Entrypoints

| Import path                                 | Purpose                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `@moritzbrantner/editor-core`               | Headless exports except React hooks.                             |
| `@moritzbrantner/editor-core/history`       | Snapshot and transaction undo/redo helpers.                      |
| `@moritzbrantner/editor-core/commands`      | Command definitions for snapshot history actions.                |
| `@moritzbrantner/editor-core/constraints`   | Shared constraint and validation helpers.                        |
| `@moritzbrantner/editor-core/entities`      | Shared entity ids, bounds, and domain adapter types.             |
| `@moritzbrantner/editor-core/indexes`       | Entity, graph, timeline, and validation index helpers.           |
| `@moritzbrantner/editor-core/interaction`   | Transient interaction session helpers.                           |
| `@moritzbrantner/editor-core/operations`    | Semantic operation runtime and operation-log helpers.            |
| `@moritzbrantner/editor-core/persistence`   | Runtime document load/save and autosave orchestration.           |
| `@moritzbrantner/editor-core/runtime`       | Document runtime state, validation, aspects, and dirty tracking. |
| `@moritzbrantner/editor-core/selection`     | Structured entity, range, port, and time selections.             |
| `@moritzbrantner/editor-core/hotkeys`       | Shortcut parsing, matching, formatting, and conflict detection.  |
| `@moritzbrantner/editor-core/tree`          | Adapter-driven tree projection and tree UI state.                |
| `@moritzbrantner/editor-core/viewport`      | Canvas and timeline viewport math.                               |
| `@moritzbrantner/editor-core/serialization` | Versioned JSON document envelopes and migrations.                |
| `@moritzbrantner/editor-core/json`          | Stable JSON sorting, stringifying, and equality helpers.         |
| `@moritzbrantner/editor-core/browser`       | Browser file, clipboard, download, and storage helpers.          |
| `@moritzbrantner/editor-core/share`         | URL-safe share token encode/decode helpers.                      |
| `@moritzbrantner/editor-core/aspects`       | Derived document aspect snapshots.                               |
| `@moritzbrantner/editor-core/react`         | Optional React hooks.                                            |

## History

Use snapshot history when the document is small enough to store whole immutable snapshots:

```ts
import {
  commitEditorSnapshotHistory,
  createEditorSnapshotHistory,
  undoEditorSnapshotHistory,
} from "@moritzbrantner/editor-core/history";

let history = createEditorSnapshotHistory({ title: "Draft" });
history = commitEditorSnapshotHistory(history, { title: "Release Notes" });
history = undoEditorSnapshotHistory(history);
```

Use transaction history when each edit has meaningful before/after state, labels, or selection
state:

```ts
import {
  createEditorTransactionHistory,
  pushEditorTransactionHistory,
  undoEditorTransactionHistory,
} from "@moritzbrantner/editor-core/history";

let history = createEditorTransactionHistory<string, string>();
history = pushEditorTransactionHistory(history, {
  id: "rename",
  before: "Draft",
  after: "Release Notes",
  selectionBefore: "title",
  selectionAfter: "title",
});

const undo = undoEditorTransactionHistory(history);
```

## Commands

Create command definitions for snapshot history controls:

```ts
import { createEditorSnapshotHistoryCommands } from "@moritzbrantner/editor-core/commands";

const commands = createEditorSnapshotHistoryCommands({
  getResetDocument: () => initialDocument,
  history,
  setHistory,
});
```

Contextual commands can derive disabled and checked state from editor state:

```ts
import { resolveEditorCommands } from "@moritzbrantner/editor-core/commands";

const commands = resolveEditorCommands(
  [
    {
      id: "duplicate",
      label: "Duplicate",
      hotkeys: ["Mod+D"],
      canRun: ({ selection }) => selection.kind === "entity",
      run: ({ document }) => duplicateSelection(document),
    },
  ],
  { document, selection },
);
```

## Runtime

Use the runtime when an editor needs document state, undo/redo, selection, validation, derived
aspects, revision metadata, and dirty tracking in one headless primitive. The runtime composes
history, aspects, and validators, but it does not define a document model.

```ts
import {
  commitEditorRuntime,
  createEditorRuntime,
  createEditorRuntimeCommands,
} from "@moritzbrantner/editor-core/runtime";

let runtime = createEditorRuntime({
  initialDocument: { body: "", title: "Draft" },
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
  setRuntime: (update) => {
    runtime = update(runtime);
  },
});
```

## Operations

Use operation runtime for editors that need semantic undo/redo, merged drag transactions, and
selection restoration:

```ts
import {
  applyEditorOperation,
  createEditorOperationRuntime,
  readEditorOperationLog,
  serializeEditorOperationLog,
  undoEditorOperationRuntime,
} from "@moritzbrantner/editor-core/operations";

let editor = createEditorOperationRuntime({
  initialDocument: { nodes: { a: { x: 0, y: 0 } } },
  initialSelection: { kind: "entity", ids: ["a"] },
});

editor = applyEditorOperation(
  editor,
  {
    id: "move-node",
    mergeKey: "drag:a",
    apply: (document) => ({ nodes: { a: { x: 10, y: 0 } } }),
    selectionAfter: { kind: "entity", ids: ["a"] },
  },
  { merge: true },
);

editor = undoEditorOperationRuntime(editor);

const log = serializeEditorOperationLog(
  [{ id: "move-a", type: "move", schemaVersion: 1, payload: { x: 10 } }],
  {
    format: "@example/operations",
    schemaVersion: 1,
  },
);
const operations = readEditorOperationLog(log, {
  format: "@example/operations",
  schemaVersion: 1,
  read: (input) => input,
});
```

## Entities, Selection, Indexes

Entity primitives are optional adapter targets for layer, graph, workflow, and timeline packages:

```ts
import { createEditorEntityDocument } from "@moritzbrantner/editor-core/entities";
import { createEditorEntityIndexes } from "@moritzbrantner/editor-core/indexes";
import { createEditorEntitySelection } from "@moritzbrantner/editor-core/selection";

const document = createEditorEntityDocument([
  { id: "layer-a", type: "layer", order: 1 },
  { id: "layer-b", type: "layer", order: 2 },
]);
const indexes = createEditorEntityIndexes(document);
const selection = createEditorEntitySelection(["layer-a"]);
```

## Constraints

Use shared constraints when multiple editor families need the same validation shape:

```ts
import {
  validateEditorGraphConnection,
  validateEditorTimelineRange,
} from "@moritzbrantner/editor-core/constraints";

validateEditorGraphConnection({ sourceId: "node-a", targetId: "node-b" });
validateEditorTimelineRange({ start: 0, end: 24 }, { min: 0 });
```

## Viewport And Interaction

Viewport helpers keep pan/zoom and timeline math headless:

```ts
import {
  createEditorViewportState,
  screenPointToEditorPoint,
  zoomEditorViewportAtPoint,
} from "@moritzbrantner/editor-core/viewport";

let viewport = createEditorViewportState({ zoom: 1 });
viewport = zoomEditorViewportAtPoint(viewport, 2, { x: 200, y: 100 });
const point = screenPointToEditorPoint({ x: 220, y: 120 }, viewport);
```

## Hotkeys

Match, format, and detect conflicting shortcuts:

```ts
import {
  formatEditorShortcutLabel,
  getEditorHotkeyConflicts,
  matchesEditorHotkey,
} from "@moritzbrantner/editor-core/hotkeys";

matchesEditorHotkey(event, "Mod+Z");
formatEditorShortcutLabel("mod+shift+z");
getEditorHotkeyConflicts("redo", "Mod+Shift+Z", hotkeys);
```

## Tree

Project any host document into an inspectable editing tree without changing the document model:

```ts
import { projectEditorTree } from "@moritzbrantner/editor-core/tree";

const tree = projectEditorTree(document, {
  getRoot(document) {
    return {
      id: "document",
      label: document.title,
      children: [{ id: "document.body", label: "Body", path: ["body"] }],
      expandedByDefault: true,
    };
  },
});
```

Tree adapters should emit stable string ids. Stable ids let selection and future collaborative
state survive document updates, reordering, and synchronization.

## Serialization

Wrap documents in versioned envelopes and migrate older versions when reading:

```ts
import {
  readEditorDocument,
  serializeEditorDocument,
} from "@moritzbrantner/editor-core/serialization";

const adapter = {
  format: "@example/editor/document",
  schemaVersion: 2,
  normalize: (document) => document,
  read: (input) => input,
};

const exported = serializeEditorDocument(document, adapter);
const imported = readEditorDocument(exported, adapter, {
  migrations: {
    1: (input) => ({ ...input, schemaVersion: 2 }),
  },
});
```

## JSON

Create stable fingerprints for documents whose object key order should not matter:

```ts
import {
  createStableEditorJsonEquals,
  stableEditorJsonStringify,
} from "@moritzbrantner/editor-core/json";

const equals = createStableEditorJsonEquals();
equals({ b: 2, a: 1 }, { a: 1, b: 2 });
stableEditorJsonStringify({ b: 2, a: 1 });
```

## Browser

Use browser helpers for downloads, uploads, local storage, and clipboard JSON:

```ts
import {
  createLocalStorageEditorStorage,
  downloadEditorJson,
  loadEditorStorage,
  saveEditorStorage,
} from "@moritzbrantner/editor-core/browser";

const storage = createLocalStorageEditorStorage({ key: "editor-document" });
const document = await loadEditorStorage(storage, fallbackDocument);
await saveEditorStorage(storage, document);
downloadEditorJson(document, { filename: "document" });
```

Browser helpers are defensive in SSR or non-browser environments. Download and local storage
helpers no-op or return fallbacks when `document`, `window`, or `localStorage` are unavailable.

## Persistence

Use persistence helpers to load and save runtime documents through any storage adapter:

```ts
import {
  loadEditorRuntimePersistence,
  saveEditorRuntimePersistence,
} from "@moritzbrantner/editor-core/persistence";

const loaded = await loadEditorRuntimePersistence(runtime, storage);
runtime = loaded.runtime;

const saved = await saveEditorRuntimePersistence(runtime, storage);
runtime = saved.runtime;
```

Persistence stores the document only. Selection, history, revisions, and undo stacks are rebuilt by
the runtime. React consumers can use `usePersistentEditorRuntime` from
`@moritzbrantner/editor-core/react` for mount loading and debounced autosave.

## Share

Encode JSON payloads into URL-safe tokens. Large payloads use gzip when the runtime supports
`CompressionStream` and compression is worthwhile:

```ts
import {
  decodeEditorSharePayload,
  editorShareUrl,
  encodeEditorSharePayload,
} from "@moritzbrantner/editor-core/share";

const token = await encodeEditorSharePayload(document);
const url = editorShareUrl(window.location.origin, "/editor", token);
const shared = await decodeEditorSharePayload(token);
```

Compressed tokens require `DecompressionStream` when decoding.

## Aspects

Resolve derived document data and track whether each derived value changed:

```ts
import { createEditorAspect, resolveEditorAspects } from "@moritzbrantner/editor-core/aspects";

const wordCount = createEditorAspect({
  id: "word-count",
  derive: ({ document }) => document.body.trim().split(/\s+/u).filter(Boolean).length,
});

const snapshot = resolveEditorAspects(document, [wordCount]);
```

## React

React APIs are opt-in through the `/react` subpath:

```tsx
import {
  useEditorHotkeys,
  useEditorRuntime,
  useEditorTreeState,
} from "@moritzbrantner/editor-core/react";

function EditorTree() {
  const runtime = useEditorRuntime({
    initialDocument: { body: "", title: "Draft" },
  });
  const tree = useEditorTreeState({ expandedIds: ["document"] });
  useEditorHotkeys({ commands });
  return (
    <button onClick={() => runtime.commit({ body: "Updated", title: "Draft" })}>
      {tree.state.selectedId ?? runtime.state.status}
    </button>
  );
}
```

## React Example

Run the GitHub Pages example locally:

```sh
bun run example:dev
```

Build the static site:

```sh
bun run example:build
```

The Pages workflow in `.github/workflows/pages.yml` publishes the built example from
`examples/react/dist` on pushes to `main`.

## Validation

Run the full local gate:

```sh
bun run verify
```

Focused checks are available for unit tests, integration/package smoke tests, Playwright e2e,
Storybook, API snapshots, Unlighthouse, and benchmarks:

```sh
bun run test:unit
bun run test:integration
bun run test:e2e
bun run test:storybook
bun run api:check
bun run unlighthouse
bun run bench
```

## Releases

See `CONTRIBUTING.md` for the release checklist and `CHANGELOG.md` for version history.
