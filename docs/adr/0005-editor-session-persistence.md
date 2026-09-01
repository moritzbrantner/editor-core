# Editor session persistence

Production persistence lifecycle behavior lives in a headless Editor Session module. Browser
storage and React are adapters at separate seams.

## Context

The existing persistence controller coordinates a Runtime with simple storage and remains the
compatible choice for current consumers. Recovery payloads, compare-and-swap reference storage,
typed failures, and interruption journals need a reusable interface that does not require Runtime,
React, DOM, or a particular backend.

## Decision

Expose an additive `createEditorSession` interface from the persistence entrypoint. The session
owns its lifecycle state, autosave timer, revision token, last-known-good snapshot, recovery
payload, in-flight work, and subscriptions. Documents cross explicit serialization and storage
adapter seams.

Neutral storage contracts and errors sit below persistence and browser integration. Memory storage
is headless. Local-storage and IndexedDB adapters are exported from the browser entrypoint. React
only subscribes to an existing session through `useEditorSession`.

Journaling is optional and document-facing. An adapter may store snapshots or use operation-log
serialization and replay internally, keeping operation semantics in the downstream editor.

## Consequences

Existing persistence controller and React runtime hooks remain compatible. Consumers may adopt the
session module independently, choose any backend or transport, and resolve conflicts explicitly.
Core entrypoints do not construct browser storage or require React. The module does not prescribe a
remote service, transport, CRDT, or collaboration vendor.
