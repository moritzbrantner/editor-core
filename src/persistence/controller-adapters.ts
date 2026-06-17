import type { EditorStorageAdapter } from "../browser.js";
import type { EditorRevisionToken } from "../collaboration.js";
import type { EditorRuntimeState } from "../runtime.js";
import type { EditorConflictStorageAdapter } from "./conflict.js";
import { loadEditorRuntimeConflictPersistence, loadEditorRuntimePersistence } from "./load.js";
import { saveEditorRuntimeConflictPersistence, saveEditorRuntimePersistence } from "./save.js";
import type {
  PersistenceControllerAdapter,
  RuntimePersistenceControllerOptions,
} from "./controller-types.js";
import type { EditorPersistenceState } from "./types.js";

export const basicPersistenceControllerAdapter = {
  load<TDocument, TSelection>(
    runtime: EditorRuntimeState<TDocument, TSelection>,
    options: RuntimePersistenceControllerOptions<TDocument, TSelection>,
  ) {
    return loadEditorRuntimePersistence(
      runtime,
      options.storage as EditorStorageAdapter<TDocument>,
      {
        now: options.now,
        onError: options.onError,
        onEvent: options.onEvent,
      },
    );
  },
  save<TDocument, TSelection>(
    runtime: EditorRuntimeState<TDocument, TSelection>,
    options: RuntimePersistenceControllerOptions<TDocument, TSelection>,
  ) {
    return saveEditorRuntimePersistence(
      runtime,
      options.storage as EditorStorageAdapter<TDocument>,
      {
        force: options.force,
        now: options.now,
        onError: options.onError,
        onEvent: options.onEvent,
      },
    );
  },
  prepareLoad(persistence: EditorPersistenceState): EditorPersistenceState {
    return {
      ...persistence,
      error: null,
      operation: "load",
      savingRevision: null,
      status: "loading",
    };
  },
  prepareSave(persistence: EditorPersistenceState): EditorPersistenceState {
    return {
      ...persistence,
      error: null,
    };
  },
} satisfies PersistenceControllerAdapter<unknown, unknown>;

export const conflictPersistenceControllerAdapter = {
  load<TDocument, TSelection>(
    runtime: EditorRuntimeState<TDocument, TSelection>,
    options: RuntimePersistenceControllerOptions<TDocument, TSelection>,
  ) {
    return loadEditorRuntimeConflictPersistence(
      runtime,
      options.storage as EditorConflictStorageAdapter<TDocument>,
      {
        now: options.now,
        onError: options.onError,
        onEvent: options.onEvent,
      },
    );
  },
  save<TDocument, TSelection>(
    runtime: EditorRuntimeState<TDocument, TSelection>,
    options: RuntimePersistenceControllerOptions<TDocument, TSelection>,
  ) {
    return saveEditorRuntimeConflictPersistence(
      runtime,
      options.storage as EditorConflictStorageAdapter<TDocument>,
      {
        force: options.force,
        now: options.now,
        onError: options.onError,
        onEvent: options.onEvent,
        revisionToken: options.getPersistence().revisionToken as EditorRevisionToken | null,
      },
    );
  },
  prepareLoad(persistence: EditorPersistenceState): EditorPersistenceState {
    return {
      ...persistence,
      conflict: null,
      error: null,
      operation: "load",
      savingRevision: null,
      status: "loading",
    };
  },
  prepareSave(persistence: EditorPersistenceState): EditorPersistenceState {
    return {
      ...persistence,
      conflict: null,
      error: null,
    };
  },
} satisfies PersistenceControllerAdapter<unknown, unknown>;
