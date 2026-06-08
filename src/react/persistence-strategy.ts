import type { EditorStorageAdapter } from "../browser.js";
import type { EditorRevisionToken } from "../collaboration.js";
import {
  loadEditorRuntimeConflictPersistence,
  loadEditorRuntimePersistence,
  saveEditorRuntimeConflictPersistence,
  saveEditorRuntimePersistence,
  type EditorConflictStorageAdapter,
  type EditorPersistenceErrorContext,
  type EditorPersistenceEventHandler,
  type EditorPersistenceState,
} from "../persistence.js";
import type { EditorRuntimeState } from "../runtime.js";

export type EditorAutosaveRetryOptions = {
  attempts?: number;
  delayMs?: number;
};

export type EditorAutosaveOptions = {
  delayMs?: number;
  retry?: EditorAutosaveRetryOptions;
  saveLatest?: boolean;
};

export type NormalizedEditorAutosaveOptions = {
  delayMs: number;
  enabled: boolean;
  retryAttempts: number;
  retryDelayMs: number;
  saveLatest: boolean;
};

export type EditorPersistenceLoadOperation<TDocument, TSelection, TStorage> = (
  runtime: EditorRuntimeState<TDocument, TSelection>,
  storage: TStorage,
  options: {
    onError?: (error: unknown, context: EditorPersistenceErrorContext) => void;
    onEvent?: EditorPersistenceEventHandler;
  },
) => Promise<{
  runtime: EditorRuntimeState<TDocument, TSelection>;
  persistence: EditorPersistenceState;
}>;

export type EditorPersistenceSaveOperation<TDocument, TSelection, TStorage> = (
  runtime: EditorRuntimeState<TDocument, TSelection>,
  storage: TStorage,
  options: {
    force?: boolean;
    onError?: (error: unknown, context: EditorPersistenceErrorContext) => void;
    onEvent?: EditorPersistenceEventHandler;
    revisionToken?: EditorRevisionToken | null;
  },
) => Promise<{
  runtime: EditorRuntimeState<TDocument, TSelection>;
  persistence: EditorPersistenceState;
  saved: boolean;
  revision: number;
}>;

export type EditorPersistenceStrategy<TDocument, TSelection, TStorage> = {
  load: EditorPersistenceLoadOperation<TDocument, TSelection, TStorage>;
  save: EditorPersistenceSaveOperation<TDocument, TSelection, TStorage>;
  prepareLoad: (persistence: EditorPersistenceState) => EditorPersistenceState;
  prepareSave: (persistence: EditorPersistenceState) => EditorPersistenceState;
  getSaveOptions: (persistence: EditorPersistenceState) => {
    revisionToken?: EditorRevisionToken | null;
  };
};

const defaultEditorRuntimeAutosaveDelayMs = 750;
const defaultEditorRuntimeAutosaveRetryDelayMs = 1500;

export const editorStoragePersistenceStrategy = {
  getSaveOptions: () => ({}),
  load: loadEditorStorageRuntimePersistence,
  prepareLoad: prepareEditorStorageLoadPersistence,
  prepareSave: prepareEditorStorageSavePersistence,
  save: saveEditorStorageRuntimePersistence,
};

export const conflictAwarePersistenceStrategy = {
  getSaveOptions: (persistence: EditorPersistenceState) => ({
    revisionToken: persistence.revisionToken,
  }),
  load: loadConflictAwareRuntimePersistence,
  prepareLoad: prepareConflictAwareLoadPersistence,
  prepareSave: prepareConflictAwareSavePersistence,
  save: saveConflictAwareRuntimePersistence,
};

export function normalizeEditorAutosaveOptions(
  autosave: boolean | EditorAutosaveOptions | undefined,
): NormalizedEditorAutosaveOptions {
  if (autosave === false) {
    return {
      delayMs: defaultEditorRuntimeAutosaveDelayMs,
      enabled: false,
      retryAttempts: 0,
      retryDelayMs: defaultEditorRuntimeAutosaveRetryDelayMs,
      saveLatest: true,
    };
  }

  if (autosave === true || autosave === undefined) {
    return {
      delayMs: defaultEditorRuntimeAutosaveDelayMs,
      enabled: true,
      retryAttempts: 0,
      retryDelayMs: defaultEditorRuntimeAutosaveRetryDelayMs,
      saveLatest: true,
    };
  }

  return {
    delayMs: autosave.delayMs ?? defaultEditorRuntimeAutosaveDelayMs,
    enabled: true,
    retryAttempts: Math.max(0, Math.trunc(autosave.retry?.attempts ?? 0)),
    retryDelayMs: autosave.retry?.delayMs ?? defaultEditorRuntimeAutosaveRetryDelayMs,
    saveLatest: autosave.saveLatest ?? true,
  };
}

function loadEditorStorageRuntimePersistence<TDocument, TSelection>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  storage: EditorStorageAdapter<TDocument>,
  options: {
    onError?: (error: unknown, context: EditorPersistenceErrorContext) => void;
    onEvent?: EditorPersistenceEventHandler;
  },
) {
  return loadEditorRuntimePersistence(runtime, storage, options);
}

function saveEditorStorageRuntimePersistence<TDocument, TSelection>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  storage: EditorStorageAdapter<TDocument>,
  options: {
    force?: boolean;
    onError?: (error: unknown, context: EditorPersistenceErrorContext) => void;
    onEvent?: EditorPersistenceEventHandler;
    revisionToken?: EditorRevisionToken | null;
  },
) {
  return saveEditorRuntimePersistence(runtime, storage, options);
}

function loadConflictAwareRuntimePersistence<TDocument, TSelection>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  storage: EditorConflictStorageAdapter<TDocument>,
  options: {
    onError?: (error: unknown, context: EditorPersistenceErrorContext) => void;
    onEvent?: EditorPersistenceEventHandler;
  },
) {
  return loadEditorRuntimeConflictPersistence(runtime, storage, options);
}

function saveConflictAwareRuntimePersistence<TDocument, TSelection>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  storage: EditorConflictStorageAdapter<TDocument>,
  options: {
    force?: boolean;
    onError?: (error: unknown, context: EditorPersistenceErrorContext) => void;
    onEvent?: EditorPersistenceEventHandler;
    revisionToken?: EditorRevisionToken | null;
  },
) {
  return saveEditorRuntimeConflictPersistence(runtime, storage, options);
}

function prepareEditorStorageLoadPersistence(
  persistence: EditorPersistenceState,
): EditorPersistenceState {
  return {
    ...persistence,
    error: null,
    operation: "load",
    savingRevision: null,
    status: "loading",
  };
}

function prepareEditorStorageSavePersistence(
  persistence: EditorPersistenceState,
): EditorPersistenceState {
  return {
    ...persistence,
    error: null,
  };
}

function prepareConflictAwareLoadPersistence(
  persistence: EditorPersistenceState,
): EditorPersistenceState {
  return {
    ...prepareEditorStorageLoadPersistence(persistence),
    conflict: null,
  };
}

function prepareConflictAwareSavePersistence(
  persistence: EditorPersistenceState,
): EditorPersistenceState {
  return {
    ...prepareEditorStorageSavePersistence(persistence),
    conflict: null,
  };
}
