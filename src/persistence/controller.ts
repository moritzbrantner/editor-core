import {
  basicPersistenceControllerAdapter,
  conflictPersistenceControllerAdapter,
} from "./controller-adapters.js";
import type {
  EditorPersistenceScheduler,
  EditorPersistenceTimer,
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
  let disposed = false;
  let saveInFlight = false;
  let saveInFlightRevision: number | null = null;
  let pendingSaveAfterInFlight = false;
  let skippedLatestSaveRevision: number | null = null;
  let failedSaveRevision: number | null = null;
  let autosaveTimer: EditorPersistenceTimer | null = null;
  let autosaveRevision: number | null = null;
  let retryTimer: EditorPersistenceTimer | null = null;
  let resolveRetryDelay: (() => void) | null = null;

  const controller: EditorRuntimePersistenceController<TDocument, TSelection> = {
    async load() {
      options.setPersistence((previous) => adapter.prepareLoad(previous));
      const result = await adapter.load(options.getRuntime(), options);
      if (disposed) {
        return;
      }
      options.setRuntime(result.runtime);
      options.setPersistence(result.persistence);
    },
    async save(saveOptions: { force?: boolean } = {}) {
      const snapshot = options.getRuntime();
      const canSave = options.canSave ?? (() => true);
      if (skippedLatestSaveRevision === snapshot.revision) {
        skippedLatestSaveRevision = null;
      }

      if (saveInFlight) {
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
        if (!disposed) {
          options.setPersistence(result.persistence);
        }
        return result.saved;
      }

      saveInFlight = true;
      saveInFlightRevision = snapshot.revision;
      options.setPersistence((previous) =>
        adapter.prepareSave({
          ...previous,
          operation: "save",
          savingRevision: snapshot.revision,
          status: "saving",
        }),
      );

      const result = await adapter.save(snapshot, withSaveOptions(options, saveOptions));
      saveInFlight = false;
      saveInFlightRevision = null;
      if (disposed) {
        return result.saved;
      }

      failedSaveRevision = result.persistence.status === "error" ? result.revision : null;
      options.setRuntime((current) =>
        current.revision === result.revision ? result.runtime : current,
      );
      options.setPersistence(result.persistence);

      const autosave = normalizeEditorAutosaveOptions(options.autosave);
      if (pendingSaveAfterInFlight && autosave.enabled && autosave.saveLatest) {
        pendingSaveAfterInFlight = false;
        controller.notifyRuntimeChanged();
      }

      return result.saved;
    },
    notifyRuntimeChanged() {
      if (disposed) {
        return;
      }

      const autosave = normalizeEditorAutosaveOptions(options.autosave);
      const runtime = options.getRuntime();
      if (!autosave.enabled || runtime.status !== "dirty") {
        clearAutosaveTimer();
        return;
      }

      if (saveInFlight) {
        if (runtime.revision === saveInFlightRevision) {
          return;
        }
        if (autosave.saveLatest && !pendingSaveAfterInFlight) {
          pendingSaveAfterInFlight = true;
          options.onEvent?.({
            reason: "in-flight",
            revision: runtime.revision,
            type: "save-skipped",
          });
        }
        if (!autosave.saveLatest) {
          skippedLatestSaveRevision = runtime.revision;
        }
        return;
      }

      if (skippedLatestSaveRevision === runtime.revision) {
        return;
      }

      if (options.getPersistence().status === "error" && failedSaveRevision === runtime.revision) {
        return;
      }

      if (autosaveRevision === runtime.revision && autosaveTimer !== null) {
        return;
      }

      clearAutosaveTimer();
      autosaveRevision = runtime.revision;
      autosaveTimer = getScheduler(options).setTimeout(() => {
        autosaveTimer = null;
        autosaveRevision = null;
        void saveWithAutosaveRetry(autosave);
      }, autosave.delayMs);
    },
    updateOptions(nextOptions) {
      options = {
        ...options,
        ...nextOptions,
      } as RuntimePersistenceControllerOptions<TDocument, TSelection>;
    },
    dispose() {
      disposed = true;
      clearAutosaveTimer();
      clearRetryTimer();
      resolveRetryDelay?.();
      resolveRetryDelay = null;
    },
  };

  async function saveWithAutosaveRetry(autosave: NormalizedEditorAutosaveOptions) {
    const revision = options.getRuntime().revision;
    let attemptsUsed = 0;

    while (true) {
      const saved = await controller.save();
      if (
        saved ||
        disposed ||
        options.getRuntime().revision !== revision ||
        failedSaveRevision !== revision ||
        attemptsUsed >= autosave.retryAttempts
      ) {
        return;
      }

      attemptsUsed += 1;
      await waitForRetryDelay(autosave.retryDelayMs);
    }
  }

  function waitForRetryDelay(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      resolveRetryDelay = resolve;
      retryTimer = getScheduler(options).setTimeout(() => {
        retryTimer = null;
        resolveRetryDelay = null;
        resolve();
      }, delayMs);
    });
  }

  function clearAutosaveTimer() {
    if (autosaveTimer === null) {
      return;
    }
    getScheduler(options).clearTimeout(autosaveTimer);
    autosaveTimer = null;
    autosaveRevision = null;
  }

  function clearRetryTimer() {
    if (retryTimer === null) {
      return;
    }
    getScheduler(options).clearTimeout(retryTimer);
    retryTimer = null;
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
