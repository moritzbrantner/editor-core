import type { EditorStorageAdapter } from "../browser.js";
import type { EditorRevisionToken } from "../collaboration.js";
import { markEditorRuntimeSaved, type EditorRuntimeState } from "../runtime.js";
import type {
  EditorConflictStorageAdapter,
  SaveEditorRuntimeConflictPersistenceOptions,
  SaveEditorRuntimeConflictPersistenceResult,
} from "./conflict.js";
import { emitRevisionTokenUpdated } from "./events.js";
import {
  createSaveErrorPersistenceState,
  createSavedPersistenceState,
  createSkippedSavePersistenceState,
} from "./state.js";
import {
  EditorPersistenceConflictError,
  type EditorPersistenceClock,
  type EditorPersistenceRevisionOptions,
  type EditorPersistenceSaveOperation,
  type SaveEditorRuntimePersistenceOptions,
  type SaveEditorRuntimePersistenceResult,
} from "./types.js";

const defaultEditorPersistenceClock: EditorPersistenceClock = () => new Date().toISOString();

export async function saveEditorRuntimePersistence<TDocument, TSelection = unknown>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  storage: EditorStorageAdapter<TDocument>,
  options: SaveEditorRuntimePersistenceOptions = {},
): Promise<SaveEditorRuntimePersistenceResult<TDocument, TSelection>> {
  return saveEditorRuntimePersistenceCore(
    runtime,
    async (snapshot) => {
      await storage.save(snapshot.document);
      return null;
    },
    options,
  );
}

export async function saveEditorRuntimeConflictPersistence<TDocument, TSelection = unknown>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  storage: EditorConflictStorageAdapter<TDocument>,
  options: SaveEditorRuntimeConflictPersistenceOptions = {},
): Promise<SaveEditorRuntimeConflictPersistenceResult<TDocument, TSelection>> {
  return saveEditorRuntimePersistenceCore(
    runtime,
    async (snapshot, revisionToken) => {
      const savedDocument = await storage.save({
        document: snapshot.document,
        revisionToken,
      });
      return savedDocument.revisionToken ?? null;
    },
    options,
    { emitRevisionToken: true, handleConflicts: true, revisionToken: options.revisionToken },
  );
}

async function saveEditorRuntimePersistenceCore<TDocument, TSelection>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  saveDocument: EditorPersistenceSaveOperation<TDocument, TSelection>,
  options: SaveEditorRuntimePersistenceOptions,
  revisionOptions: EditorPersistenceRevisionOptions = {},
): Promise<SaveEditorRuntimePersistenceResult<TDocument, TSelection>> {
  const revision = runtime.revision;
  const now = options.now ?? defaultEditorPersistenceClock;
  const revisionToken: EditorRevisionToken | null = revisionOptions.revisionToken ?? null;

  if (runtime.status === "clean" && !options.force) {
    options.onEvent?.({
      reason: "clean",
      revision,
      type: "save-skipped",
    });
    return {
      persistence: createSkippedSavePersistenceState({
        revisionToken,
        savedRevision: runtime.savedRevision,
      }),
      revision,
      runtime,
      saved: false,
    };
  }

  options.onEvent?.({ revision, type: "save-start" });

  try {
    const savedRevisionToken = await saveDocument(runtime, revisionToken);
    const savedRuntime = markEditorRuntimeSaved(runtime);
    const timestamp = now();
    options.onEvent?.({ revision, savedAt: timestamp, type: "save-success" });
    emitRevisionTokenUpdated(options, savedRevisionToken, revisionOptions);

    return {
      persistence: createSavedPersistenceState({
        revision,
        revisionToken: savedRevisionToken,
        timestamp,
      }),
      revision,
      runtime: savedRuntime,
      saved: true,
    };
  } catch (error) {
    if (revisionOptions.handleConflicts && error instanceof EditorPersistenceConflictError) {
      options.onError?.(error, { operation: "save", revision });
      options.onEvent?.({ error, revision, type: "save-conflict" });

      return {
        persistence: createSaveErrorPersistenceState({
          conflict: error,
          error,
          revisionToken,
          savedRevision: runtime.savedRevision,
        }),
        revision,
        runtime,
        saved: false,
      };
    }

    options.onError?.(error, { operation: "save", revision });
    options.onEvent?.({ error, revision, type: "save-error" });

    return {
      persistence: createSaveErrorPersistenceState({
        conflict: null,
        error,
        revisionToken,
        savedRevision: runtime.savedRevision,
      }),
      revision,
      runtime,
      saved: false,
    };
  }
}
