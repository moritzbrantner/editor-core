# Editor session persistence

`createEditorSession` composes serialization, revisioned storage, autosave, recovery snapshots, and
optional journaling behind a framework-neutral interface.

```ts
import {
  createEditorSession,
  createMemoryEditorSessionStorage,
} from "@moenarch/editor-core/persistence";

const session = createEditorSession({
  autosave: { delayMs: 750 },
  document: {
    parse: (payload) => readEditorDocument(payload, documentAdapter, { migrations }),
    serialize: (document) => serializeEditorDocument(document, documentAdapter),
  },
  equals: documentsEqual,
  initialDocument,
  storage: createMemoryEditorSessionStorage(),
});

await session.load();
await session.updateDocument(nextDocument);
await session.flush();
```

The state is a discriminated union with `idle`, `dirty`, `saving`, `saved`, `failed`,
`conflicted`, and `recoverable` variants. Failed writes keep both the current document and the
last-known-good snapshot. A stale compare-and-swap write enters `conflicted` without accepting the
remote value or marking the local document saved.

`cancelAutosave()` removes a scheduled save. `flush()` cancels the debounce and waits for the
current or immediate save. `dispose()` cancels timers, observes in-flight save work, and removes
subscriptions.

## Storage adapters

Memory storage is available from the persistence entrypoint. Browser storage remains isolated to
the browser entrypoint:

```ts
import {
  createIndexedDbEditorSessionStorage,
  createLocalStorageEditorSessionStorage,
} from "@moenarch/editor-core/browser";

const local = createLocalStorageEditorSessionStorage({ key: "workflow" });
const indexed = createIndexedDbEditorSessionStorage({
  databaseName: "workflow-editor",
  key: "document",
});
```

All three adapters expose revision tokens and reject stale writes with
`EditorSessionConflictError`. Browser failures classify quota, permission, serialization, and
storage errors. The document adapter classifies migration and validation errors when it uses the
Editor Core serialization errors.

## Recovery and journaling

If a stored document cannot be validated or migrated, the session enters `recoverable` and keeps
the raw payload available through `exportRecoveryPayload()`. Call `recover(document)` after the
user imports, repairs, or accepts a replacement document.

An optional `EditorSessionJournalAdapter` may persist unsaved work before autosave. Its
implementation can store document snapshots or encode/replay Editor Core operation logs. On the
next `load()`, journaled work that differs from the stored snapshot enters `recoverable`; a
successful save clears the journal.

## React

React remains an adapter over the headless session:

```tsx
import { useEditorSession } from "@moenarch/editor-core/react";

const persistence = useEditorSession(session);
```

The hook only subscribes to an existing session. The caller owns session creation and disposal.
