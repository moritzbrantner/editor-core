import {
  basicPersistenceControllerAdapter,
  conflictPersistenceControllerAdapter,
} from "./controller-adapters.js";
import {
  beginEditorPersistenceSave,
  consumePendingLatestSave,
  consumeSkippedLatestSaveRevision,
  createEditorPersistenceControllerState,
  clearEditorPersistenceAutosave,
  disposeEditorPersistenceControllerState,
  finishEditorPersistenceSave,
  isEditorPersistenceControllerDisposed,
  reduceEditorPersistenceRuntimeChanged,
  scheduleEditorPersistenceAutosave,
  shouldRunPendingLatestSave,
  shouldSkipEditorPersistenceLoad,
  shouldStopEditorPersistenceAutosaveRetry,
  waitForEditorPersistenceRetryDelay,
} from "./controller-state.js";
import type {
  EditorPersistenceScheduler,
  EditorRuntimeConflictPersistenceControllerOptions,
  EditorRuntimePersistenceController,
  EditorRuntimePersistenceControllerOptions,
  NormalizedEditorAutosaveOptions,
  PersistenceControllerAdapter,
  RuntimePersistenceControllerOptions,
} from "./controller-types.js";
import { normalizeEditorAutosaveOptions } from "./controller-types.js";

export function createEditorRuntimePersistenceController<TDocument, TSelection = unknown>(
  options: EditorRuntimePersistenceControllerOptions<TDocument, TSelection>,
): EditorRuntimePersistenceController<TDocument, TSelection> {
  return createEditorRuntimePersistenceControllerCore(
    options,
    basicPersistenceControllerAdapter as PersistenceControllerAdapter<TDocument, TSelection>,
  );
}

export function createEditorRuntimeConflictPersistenceController<TDocument, TSelection = unknown>(
  options: EditorRuntimeConflictPersistenceControllerOptions<TDocument, TSelection>,
): EditorRuntimePersistenceController<TDocument, TSelection> {
  return createEditorRuntimePersistenceControllerCore(
    options,
    conflictPersistenceControllerAdapter as PersistenceControllerAdapter<TDocument, TSelection>,
  );
}

function createEditorRuntimePersistenceControllerCore<TDocument, TSelection>(
  initialOptions: RuntimePersistenceControllerOptions<TDocument, TSelection>,
  adapter: PersistenceControllerAdapter<TDocument, TSelection>,
): EditorRuntimePersistenceController<TDocument, TSelection> {
  let options = initialOptions;
  const state = createEditorPersistenceControllerState();

  const controller: EditorRuntimePersistenceController<TDocument, TSelection> = {
    async load() {
      if (shouldSkipEditorPersistenceLoad(state)) {
        return;
      }

      options.setPersistence((previous) => adapter.prepareLoad(previous));
      const result = await adapter.load(options.getRuntime(), options);
      if (isEditorPersistenceControllerDisposed(state)) {
        return;
      }
      options.setRuntime(result.runtime);
      options.setPersistence(result.persistence);
    },
    async save(saveOptions: { force?: boolean } = {}) {
      if (isEditorPersistenceControllerDisposed(state)) {
        return false;
      }

      const snapshot = options.getRuntime();
      const canSave = options.canSave ?? (() => true);
      consumeSkippedLatestSaveRevision(state, snapshot.revision);

      if (state.saveInFlightRevision !== null) {
        options.onEvent?.({
          reason: "in-flight",
          revision: snapshot.revision,
          type: "save-skipped",
        });
        return false;
      }

      if (!canSave(snapshot)) {
        options.onEvent?.({
          reason: "blocked",
          revision: snapshot.revision,
          type: "save-skipped",
        });
        return false;
      }

      if (snapshot.status === "clean" && !saveOptions.force) {
        const result = await adapter.save(snapshot, withSaveOptions(options, saveOptions));
        if (!isEditorPersistenceControllerDisposed(state)) {
          options.setPersistence(result.persistence);
        }
        return result.saved;
      }

      beginEditorPersistenceSave(state, snapshot.revision);
      options.setPersistence((previous) =>
        adapter.prepareSave({
          ...previous,
          operation: "save",
          savingRevision: snapshot.revision,
          status: "saving",
        }),
      );

      const result = await adapter.save(snapshot, withSaveOptions(options, saveOptions));
      finishEditorPersistenceSave(state, {
        failed: result.persistence.status === "error",
        revision: result.revision,
      });
      if (isEditorPersistenceControllerDisposed(state)) {
        return result.saved;
      }

      options.setRuntime((current) =>
        current.revision === result.revision ? result.runtime : current,
      );
      options.setPersistence(result.persistence);

      const autosave = normalizeEditorAutosaveOptions(options.autosave);
      if (shouldRunPendingLatestSave(state, autosave)) {
        consumePendingLatestSave(state);
        controller.notifyRuntimeChanged();
      }

      return result.saved;
    },
    notifyRuntimeChanged() {
      if (isEditorPersistenceControllerDisposed(state)) {
        return;
      }

      const autosave = normalizeEditorAutosaveOptions(options.autosave);
      const runtime = options.getRuntime();
      const result = reduceEditorPersistenceRuntimeChanged(state, {
        autosave,
        persistence: options.getPersistence(),
        runtime,
      });

      if (result.type === "none") {
        return;
      }

      if (result.type === "clear-autosave") {
        clearEditorPersistenceAutosave(state, getScheduler(options));
        return;
      }

      if (result.type === "emit-save-skipped") {
        options.onEvent?.({
          reason: "in-flight",
          revision: result.revision,
          type: "save-skipped",
        });
        return;
      }

      scheduleEditorPersistenceAutosave(state, {
        callback: () => {
          void saveWithAutosaveRetry(autosave);
        },
        delayMs: result.delayMs,
        revision: result.revision,
        scheduler: getScheduler(options),
      });
    },
    updateOptions(nextOptions) {
      options = {
        ...options,
        ...nextOptions,
      } as RuntimePersistenceControllerOptions<TDocument, TSelection>;
    },
    dispose() {
      disposeEditorPersistenceControllerState(state, getScheduler(options));
    },
  };

  async function saveWithAutosaveRetry(autosave: NormalizedEditorAutosaveOptions) {
    const revision = options.getRuntime().revision;
    let attemptsUsed = 0;

    while (true) {
      if (isEditorPersistenceControllerDisposed(state)) {
        return;
      }

      const saved = await controller.save();
      if (
        shouldStopEditorPersistenceAutosaveRetry(state, {
          attemptsUsed,
          currentRevision: options.getRuntime().revision,
          retryAttempts: autosave.retryAttempts,
          saved,
          targetRevision: revision,
        })
      ) {
        return;
      }

      attemptsUsed += 1;
      await waitForEditorPersistenceRetryDelay(state, {
        delayMs: autosave.retryDelayMs,
        scheduler: getScheduler(options),
      });
    }
  }

  return controller;
}

function withSaveOptions<TDocument, TSelection>(
  options: RuntimePersistenceControllerOptions<TDocument, TSelection>,
  saveOptions: { force?: boolean },
): RuntimePersistenceControllerOptions<TDocument, TSelection> {
  return {
    ...options,
    force: saveOptions.force,
  };
}

function getScheduler<TDocument, TSelection>(
  options: RuntimePersistenceControllerOptions<TDocument, TSelection>,
): EditorPersistenceScheduler {
  return options.scheduler ?? defaultEditorPersistenceScheduler;
}

const defaultEditorPersistenceScheduler: EditorPersistenceScheduler = {
  clearTimeout(timer) {
    globalThis.clearTimeout(timer as ReturnType<typeof globalThis.setTimeout>);
  },
  setTimeout(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs);
  },
};
