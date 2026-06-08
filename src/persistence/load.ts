import type { EditorStorageAdapter } from "../browser.js";
import { resetEditorRuntime, type EditorRuntimeState } from "../runtime.js";
import type {
  EditorConflictStorageAdapter,
  LoadEditorRuntimeConflictPersistenceOptions,
  LoadEditorRuntimeConflictPersistenceResult,
} from "./conflict.js";
import { emitRevisionTokenUpdated } from "./events.js";
import { createLoadedPersistenceState, createLoadErrorPersistenceState } from "./state.js";
import type {
  EditorPersistenceClock,
  EditorPersistenceLoadOperation,
  EditorPersistenceRevisionOptions,
  LoadEditorRuntimePersistenceOptions,
  LoadEditorRuntimePersistenceResult,
} from "./types.js";

const defaultEditorPersistenceClock: EditorPersistenceClock = () => new Date().toISOString();

export async function loadEditorRuntimePersistence<TDocument, TSelection = unknown>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  storage: EditorStorageAdapter<TDocument>,
  options: LoadEditorRuntimePersistenceOptions<TDocument, TSelection> = {},
): Promise<LoadEditorRuntimePersistenceResult<TDocument, TSelection>> {
  return loadEditorRuntimePersistenceCore(
    runtime,
    async () => {
      const document = await storage.load();
      return document === null ? null : { document, revisionToken: null };
    },
    options,
  );
}

export async function loadEditorRuntimeConflictPersistence<TDocument, TSelection = unknown>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  storage: EditorConflictStorageAdapter<TDocument>,
  options: LoadEditorRuntimeConflictPersistenceOptions<TDocument, TSelection> = {},
): Promise<LoadEditorRuntimeConflictPersistenceResult<TDocument, TSelection>> {
  return loadEditorRuntimePersistenceCore(
    runtime,
    async () => {
      const persisted = await storage.load();
      return persisted
        ? {
            document: persisted.document,
            revisionToken: persisted.revisionToken ?? null,
          }
        : null;
    },
    options,
    { emitRevisionToken: true },
  );
}

async function loadEditorRuntimePersistenceCore<TDocument, TSelection>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  loadDocument: EditorPersistenceLoadOperation<TDocument>,
  options: LoadEditorRuntimePersistenceOptions<TDocument, TSelection>,
  revisionOptions: EditorPersistenceRevisionOptions = {},
): Promise<LoadEditorRuntimePersistenceResult<TDocument, TSelection>> {
  const now = options.now ?? defaultEditorPersistenceClock;
  options.onEvent?.({ revision: runtime.revision, type: "load-start" });

  try {
    const persisted = await loadDocument();
    const document = persisted?.document ?? options.fallback ?? runtime.document;
    const loadedRuntime = resetEditorRuntime(runtime, document, {
      markSaved: true,
      selection: options.selection,
    });
    const timestamp = now();
    const revisionToken = persisted?.revisionToken ?? null;
    options.onEvent?.({
      loadedAt: timestamp,
      revision: loadedRuntime.revision,
      type: "load-success",
    });
    emitRevisionTokenUpdated(options, revisionToken, revisionOptions);

    return {
      persistence: createLoadedPersistenceState({
        revision: loadedRuntime.revision,
        revisionToken,
        timestamp,
      }),
      runtime: loadedRuntime,
    };
  } catch (error) {
    options.onError?.(error, { operation: "load" });
    options.onEvent?.({ error, type: "load-error" });

    const document = options.fallback ?? runtime.document;
    const fallbackRuntime = resetEditorRuntime(runtime, document, {
      markSaved: true,
      selection: options.selection,
    });

    return {
      persistence: createLoadErrorPersistenceState({
        error,
        revision: fallbackRuntime.revision,
        revisionToken: null,
      }),
      runtime: fallbackRuntime,
    };
  }
}
