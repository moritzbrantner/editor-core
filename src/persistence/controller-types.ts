import type { EditorStorageAdapter } from "../browser.js";
import type { EditorRuntimeState } from "../runtime.js";
import type { EditorConflictStorageAdapter } from "./conflict.js";
import type {
  EditorPersistenceErrorContext,
  EditorPersistenceEventHandler,
  EditorPersistenceState,
  LoadEditorRuntimePersistenceResult,
  SaveEditorRuntimePersistenceResult,
} from "./types.js";

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

export type EditorPersistenceTimer = unknown;

export type EditorPersistenceScheduler = {
  setTimeout: (callback: () => void, delayMs: number) => EditorPersistenceTimer;
  clearTimeout: (timer: EditorPersistenceTimer) => void;
};

export type EditorRuntimeStateUpdater<TDocument, TSelection = unknown> =
  | EditorRuntimeState<TDocument, TSelection>
  | ((
      runtime: EditorRuntimeState<TDocument, TSelection>,
    ) => EditorRuntimeState<TDocument, TSelection>);

export type EditorPersistenceStateUpdater =
  | EditorPersistenceState
  | ((persistence: EditorPersistenceState) => EditorPersistenceState);

export type EditorRuntimePersistenceControllerOptions<TDocument, TSelection = unknown> = {
  getRuntime: () => EditorRuntimeState<TDocument, TSelection>;
  setRuntime: (updater: EditorRuntimeStateUpdater<TDocument, TSelection>) => void;
  getPersistence: () => EditorPersistenceState;
  setPersistence: (updater: EditorPersistenceStateUpdater) => void;
  storage: EditorStorageAdapter<TDocument>;
  autosave?: boolean | EditorAutosaveOptions;
  canSave?: (runtime: EditorRuntimeState<TDocument, TSelection>) => boolean;
  now?: () => string;
  onError?: (error: unknown, context: EditorPersistenceErrorContext) => void;
  onEvent?: EditorPersistenceEventHandler;
  scheduler?: EditorPersistenceScheduler;
};

export type EditorRuntimeConflictPersistenceControllerOptions<
  TDocument,
  TSelection = unknown,
> = Omit<EditorRuntimePersistenceControllerOptions<TDocument, TSelection>, "storage"> & {
  storage: EditorConflictStorageAdapter<TDocument>;
};

export type EditorRuntimePersistenceController<TDocument, TSelection = unknown> = {
  load: () => Promise<void>;
  save: (options?: { force?: boolean }) => Promise<boolean>;
  notifyRuntimeChanged: () => void;
  updateOptions: (
    options: Partial<
      | EditorRuntimePersistenceControllerOptions<TDocument, TSelection>
      | EditorRuntimeConflictPersistenceControllerOptions<TDocument, TSelection>
    >,
  ) => void;
  dispose: () => void;
};

export type RuntimePersistenceControllerOptions<TDocument, TSelection> = Omit<
  EditorRuntimePersistenceControllerOptions<TDocument, TSelection>,
  "storage"
> & {
  force?: boolean;
  storage: EditorStorageAdapter<TDocument> | EditorConflictStorageAdapter<TDocument>;
};

export type PersistenceControllerAdapter<TDocument, TSelection> = {
  load: (
    runtime: EditorRuntimeState<TDocument, TSelection>,
    options: RuntimePersistenceControllerOptions<TDocument, TSelection>,
  ) => Promise<LoadEditorRuntimePersistenceResult<TDocument, TSelection>>;
  save: (
    runtime: EditorRuntimeState<TDocument, TSelection>,
    options: RuntimePersistenceControllerOptions<TDocument, TSelection>,
  ) => Promise<SaveEditorRuntimePersistenceResult<TDocument, TSelection>>;
  prepareLoad: (persistence: EditorPersistenceState) => EditorPersistenceState;
  prepareSave: (persistence: EditorPersistenceState) => EditorPersistenceState;
};

const defaultEditorRuntimeAutosaveDelayMs = 750;
const defaultEditorRuntimeAutosaveRetryDelayMs = 1500;

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
