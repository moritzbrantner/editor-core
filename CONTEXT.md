# Editor Core

Editor Core is a headless, domain-neutral editing kernel for downstream editor packages.

It owns mechanics that are useful regardless of whether a consumer edits a graph, timeline, layer tree, document, or another domain. It must not define those domains itself.

## Language

**Runtime**:
The current arbitrary document plus caller-owned selection, revision, dirty/save status, validation issues, and undo capability.

**Operation Runtime**:
A runtime that applies caller-defined semantic operations and tracks undoable operation transactions.

**Command Runtime**:
A runtime that resolves, diagnoses, and executes editor commands under shared disabled, read-only, scope, and editable-target policy.

**Persistence State**:
The load/save status that describes how a runtime relates to stored data, including optional revision tokens and save conflicts.

**Persistent Runtime**:
A runtime coordinated with persistence state and storage so it can load, save, skip clean saves, and recover from save failures.

**Autosave**:
Automatic persistence of a dirty runtime after a delay, with optional retry and latest-revision follow-up behavior.

## Boundary

Editor Core may know about generic documents, operations, history, commands, persistence, entity identities, tree projections, generic 2D viewport math, and generic React bindings.

Editor Core must not know about graph nodes/edges/ports, workflows/DAGs, timeline tracks/clips/time ranges, media processing, or collaboration protocols. Those semantics belong to the specialization or product that owns them.

A useful check for new core APIs: they should still make sense for an editor whose document is `{ text: string }` and whose selection is `{ start: number; end: number }`.
