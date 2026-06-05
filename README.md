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
bun add @moritzbrantner/editor-core
```

For React hooks:

```sh
bun add react @moritzbrantner/editor-core
```

## Entrypoints

| Import path                                 | Purpose                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `@moritzbrantner/editor-core`               | Headless exports except React hooks.                             |
| `@moritzbrantner/editor-core/history`       | Snapshot and transaction undo/redo helpers.                      |
| `@moritzbrantner/editor-core/commands`      | Command definitions for snapshot history actions.                |
| `@moritzbrantner/editor-core/runtime`       | Document runtime state, validation, aspects, and dirty tracking. |
| `@moritzbrantner/editor-core/hotkeys`       | Shortcut parsing, matching, formatting, and conflict detection.  |
| `@moritzbrantner/editor-core/tree`          | Adapter-driven tree projection and tree UI state.                |
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
