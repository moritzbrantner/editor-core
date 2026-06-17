# Editor Core

Editor Core provides headless editor state, persistence, synchronization, and React integration
vocabulary for downstream editor packages.

## Language

**Runtime**:
The current editor document with its selection, revision, save status, validation issues, and undo
capability. A runtime is the state a user is actively editing.
_Avoid_: Store, model, editor instance

**Persistence State**:
The load/save status that describes how a runtime relates to stored data. It records operation,
error, timestamps, saved revision, in-flight revision, and optional conflict information.
_Avoid_: Save status, storage state

**Persistent Runtime**:
A runtime coordinated with persistence state and storage so it can load, save, skip clean saves, and
recover from save failures.
_Avoid_: Saved editor, persisted editor

**Autosave**:
Automatic persistence of a dirty runtime after a delay, with optional retry and latest-revision
follow-up behavior.
_Avoid_: Auto persistence, background save

**Revision Token**:
A storage-provided version marker used to detect stale saves in conflict-aware persistence.
_Avoid_: ETag, version, cursor

**Conflict-Aware Persistence**:
Persistence that uses revision tokens and exposes stale-save conflicts without marking the local
runtime clean.
_Avoid_: Server persistence, optimistic save
