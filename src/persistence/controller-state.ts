import type { EditorRuntimeStatus } from "../runtime.js";
import type {
  EditorPersistenceScheduler,
  EditorPersistenceTimer,
  NormalizedEditorAutosaveOptions,
} from "./controller-types.js";
import type { EditorPersistenceState } from "./types.js";

export type EditorPersistenceControllerRuntimeSnapshot = {
  revision: number;
  status: EditorRuntimeStatus;
};

export type EditorPersistenceControllerRuntimeChangeResult =
  | { type: "none" }
  | { type: "clear-autosave" }
  | { revision: number; type: "emit-save-skipped" }
  | { delayMs: number; revision: number; type: "schedule-autosave" };

export type EditorPersistenceControllerState = {
  autosaveRevision: number | null;
  autosaveTimer: EditorPersistenceTimer | null;
  disposed: boolean;
  failedSaveRevision: number | null;
  pendingSaveAfterInFlight: boolean;
  resolveRetryDelay: (() => void) | null;
  retryTimer: EditorPersistenceTimer | null;
  saveInFlightRevision: number | null;
  skippedLatestSaveRevision: number | null;
};

export function createEditorPersistenceControllerState(): EditorPersistenceControllerState {
  return {
    autosaveRevision: null,
    autosaveTimer: null,
    disposed: false,
    failedSaveRevision: null,
    pendingSaveAfterInFlight: false,
    resolveRetryDelay: null,
    retryTimer: null,
    saveInFlightRevision: null,
    skippedLatestSaveRevision: null,
  };
}

export function isEditorPersistenceControllerDisposed(
  state: EditorPersistenceControllerState,
): boolean {
  return state.disposed;
}

export function beginEditorPersistenceSave(
  state: EditorPersistenceControllerState,
  revision: number,
): void {
  state.saveInFlightRevision = revision;
}

export function finishEditorPersistenceSave(
  state: EditorPersistenceControllerState,
  options: { failed: boolean; revision: number },
): void {
  state.failedSaveRevision = options.failed ? options.revision : null;
  state.saveInFlightRevision = null;
}

export function consumeSkippedLatestSaveRevision(
  state: EditorPersistenceControllerState,
  revision: number,
): void {
  if (state.skippedLatestSaveRevision === revision) {
    state.skippedLatestSaveRevision = null;
  }
}

export function shouldSkipEditorPersistenceLoad(state: EditorPersistenceControllerState): boolean {
  return state.disposed || state.saveInFlightRevision !== null;
}

export function reduceEditorPersistenceRuntimeChanged(
  state: EditorPersistenceControllerState,
  input: {
    autosave: NormalizedEditorAutosaveOptions;
    persistence: EditorPersistenceState;
    runtime: EditorPersistenceControllerRuntimeSnapshot;
  },
): EditorPersistenceControllerRuntimeChangeResult {
  if (state.disposed) {
    return { type: "none" };
  }

  if (!input.autosave.enabled || input.runtime.status !== "dirty") {
    return { type: "clear-autosave" };
  }

  if (state.saveInFlightRevision !== null) {
    if (input.runtime.revision === state.saveInFlightRevision) {
      return { type: "none" };
    }

    if (input.autosave.saveLatest) {
      if (state.pendingSaveAfterInFlight) {
        return { type: "none" };
      }
      state.pendingSaveAfterInFlight = true;
      return { revision: input.runtime.revision, type: "emit-save-skipped" };
    }

    state.skippedLatestSaveRevision = input.runtime.revision;
    return { type: "none" };
  }

  if (state.skippedLatestSaveRevision === input.runtime.revision) {
    return { type: "none" };
  }

  if (input.persistence.status === "error" && state.failedSaveRevision === input.runtime.revision) {
    return { type: "none" };
  }

  if (state.autosaveRevision === input.runtime.revision && state.autosaveTimer !== null) {
    return { type: "none" };
  }

  return {
    delayMs: input.autosave.delayMs,
    revision: input.runtime.revision,
    type: "schedule-autosave",
  };
}

export function shouldRunPendingLatestSave(
  state: EditorPersistenceControllerState,
  autosave: NormalizedEditorAutosaveOptions,
): boolean {
  return state.pendingSaveAfterInFlight && autosave.enabled && autosave.saveLatest;
}

export function consumePendingLatestSave(state: EditorPersistenceControllerState): void {
  state.pendingSaveAfterInFlight = false;
}

export function shouldStopEditorPersistenceAutosaveRetry(
  state: EditorPersistenceControllerState,
  input: {
    attemptsUsed: number;
    currentRevision: number;
    retryAttempts: number;
    saved: boolean;
    targetRevision: number;
  },
): boolean {
  return (
    state.disposed ||
    input.saved ||
    input.currentRevision !== input.targetRevision ||
    state.failedSaveRevision !== input.targetRevision ||
    input.attemptsUsed >= input.retryAttempts
  );
}

export function scheduleEditorPersistenceAutosave(
  state: EditorPersistenceControllerState,
  input: {
    callback: () => void;
    delayMs: number;
    revision: number;
    scheduler: EditorPersistenceScheduler;
  },
): void {
  clearEditorPersistenceAutosave(state, input.scheduler);
  state.autosaveRevision = input.revision;
  state.autosaveTimer = input.scheduler.setTimeout(() => {
    state.autosaveTimer = null;
    state.autosaveRevision = null;
    input.callback();
  }, input.delayMs);
}

export function clearEditorPersistenceAutosave(
  state: EditorPersistenceControllerState,
  scheduler: EditorPersistenceScheduler,
): void {
  if (state.autosaveTimer === null) {
    return;
  }

  scheduler.clearTimeout(state.autosaveTimer);
  state.autosaveTimer = null;
  state.autosaveRevision = null;
}

export function waitForEditorPersistenceRetryDelay(
  state: EditorPersistenceControllerState,
  input: {
    delayMs: number;
    scheduler: EditorPersistenceScheduler;
  },
): Promise<void> {
  return new Promise((resolve) => {
    state.resolveRetryDelay = resolve;
    state.retryTimer = input.scheduler.setTimeout(() => {
      state.retryTimer = null;
      state.resolveRetryDelay = null;
      resolve();
    }, input.delayMs);
  });
}

export function clearEditorPersistenceRetry(
  state: EditorPersistenceControllerState,
  scheduler: EditorPersistenceScheduler,
): void {
  if (state.retryTimer === null) {
    return;
  }

  scheduler.clearTimeout(state.retryTimer);
  state.retryTimer = null;
}

export function disposeEditorPersistenceControllerState(
  state: EditorPersistenceControllerState,
  scheduler: EditorPersistenceScheduler,
): void {
  state.disposed = true;
  clearEditorPersistenceAutosave(state, scheduler);
  clearEditorPersistenceRetry(state, scheduler);
  state.resolveRetryDelay?.();
  state.resolveRetryDelay = null;
}
