import type { EditorRevisionToken } from "../collaboration.js";
import type { EditorPersistenceConflictError, EditorPersistenceState } from "./types.js";

export function createEditorPersistenceState(): EditorPersistenceState {
  return {
    error: null,
    loadedAt: null,
    operation: null,
    savedAt: null,
    savedRevision: null,
    savingRevision: null,
    revisionToken: null,
    conflict: null,
    status: "idle",
  };
}

export function createLoadedPersistenceState(options: {
  revision: number;
  revisionToken: EditorRevisionToken | null;
  timestamp: string;
}): EditorPersistenceState {
  return {
    conflict: null,
    error: null,
    loadedAt: options.timestamp,
    operation: "load",
    revisionToken: options.revisionToken,
    savedAt: options.timestamp,
    savedRevision: options.revision,
    savingRevision: null,
    status: "loaded",
  };
}

export function createLoadErrorPersistenceState(options: {
  error: unknown;
  revision: number;
  revisionToken: EditorRevisionToken | null;
}): EditorPersistenceState {
  return {
    conflict: null,
    error: options.error,
    loadedAt: null,
    operation: "load",
    revisionToken: options.revisionToken,
    savedAt: null,
    savedRevision: options.revision,
    savingRevision: null,
    status: "error",
  };
}

export function createSkippedSavePersistenceState(options: {
  revisionToken: EditorRevisionToken | null;
  savedRevision: number;
}): EditorPersistenceState {
  return {
    conflict: null,
    error: null,
    loadedAt: null,
    operation: null,
    revisionToken: options.revisionToken,
    savedAt: null,
    savedRevision: options.savedRevision,
    savingRevision: null,
    status: "idle",
  };
}

export function createSavedPersistenceState(options: {
  revision: number;
  revisionToken: EditorRevisionToken | null;
  timestamp: string;
}): EditorPersistenceState {
  return {
    conflict: null,
    error: null,
    loadedAt: null,
    operation: "save",
    revisionToken: options.revisionToken,
    savedAt: options.timestamp,
    savedRevision: options.revision,
    savingRevision: null,
    status: "saved",
  };
}

export function createSaveErrorPersistenceState(options: {
  conflict: EditorPersistenceConflictError | null;
  error: unknown;
  revisionToken: EditorRevisionToken | null;
  savedRevision: number;
}): EditorPersistenceState {
  return {
    conflict: options.conflict,
    error: options.error,
    loadedAt: null,
    operation: "save",
    revisionToken: options.revisionToken,
    savedAt: null,
    savedRevision: options.savedRevision,
    savingRevision: null,
    status: "error",
  };
}

export function clearEditorPersistenceConflict(
  persistence: EditorPersistenceState,
): EditorPersistenceState {
  return {
    ...persistence,
    conflict: null,
    error: persistence.error === persistence.conflict ? null : persistence.error,
  };
}
