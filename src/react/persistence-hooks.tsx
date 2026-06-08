import * as React from "react";
import type { EditorStorageAdapter } from "../browser.js";
import {
  createEditorPersistenceState,
  type EditorConflictStorageAdapter,
  type EditorPersistenceErrorContext,
  type EditorPersistenceEventHandler,
  type EditorPersistenceState,
} from "../persistence.js";
import type { EditorRuntimeState } from "../runtime.js";
import {
  conflictAwarePersistenceStrategy,
  editorStoragePersistenceStrategy,
  normalizeEditorAutosaveOptions,
  type EditorAutosaveOptions,
  type EditorPersistenceStrategy,
} from "./persistence-strategy.js";
import {
  useEditorRuntime,
  type UseEditorRuntimeOptions,
  type UseEditorRuntimeResult,
} from "./runtime-hooks.js";

export type UsePersistentEditorRuntimeOptions<
  TDocument,
  TSelection = unknown,
> = UseEditorRuntimeOptions<TDocument, TSelection> & {
  storage: EditorStorageAdapter<TDocument>;
  autosave?: boolean | EditorAutosaveOptions;
  loadOnMount?: boolean;
  canSave?: (runtime: EditorRuntimeState<TDocument, TSelection>) => boolean;
  onPersistenceError?: (error: unknown, context: EditorPersistenceErrorContext) => void;
  onPersistenceEvent?: EditorPersistenceEventHandler;
};

export type UsePersistentEditorRuntimeResult<
  TDocument,
  TSelection = unknown,
> = UseEditorRuntimeResult<TDocument, TSelection> & {
  persistence: EditorPersistenceState;
  load: () => Promise<void>;
  save: (options?: { force?: boolean }) => Promise<boolean>;
};

export type UseConflictAwareEditorRuntimeOptions<TDocument, TSelection = unknown> = Omit<
  UsePersistentEditorRuntimeOptions<TDocument, TSelection>,
  "storage"
> & {
  storage: EditorConflictStorageAdapter<TDocument>;
};

export type UseConflictAwareEditorRuntimeResult<
  TDocument,
  TSelection = unknown,
> = UseEditorRuntimeResult<TDocument, TSelection> & {
  persistence: EditorPersistenceState;
  load: () => Promise<void>;
  save: (options?: { force?: boolean }) => Promise<boolean>;
};

type UsePersistentEditorRuntimeCoreOptions<TDocument, TSelection, TStorage> =
  UseEditorRuntimeOptions<TDocument, TSelection> & {
    storage: TStorage;
    autosave?: boolean | EditorAutosaveOptions;
    loadOnMount?: boolean;
    canSave?: (runtime: EditorRuntimeState<TDocument, TSelection>) => boolean;
    onPersistenceError?: (error: unknown, context: EditorPersistenceErrorContext) => void;
    onPersistenceEvent?: EditorPersistenceEventHandler;
  };

export function usePersistentEditorRuntime<TDocument, TSelection = unknown>(
  options: UsePersistentEditorRuntimeOptions<TDocument, TSelection>,
): UsePersistentEditorRuntimeResult<TDocument, TSelection> {
  return usePersistentEditorRuntimeCore<TDocument, TSelection, EditorStorageAdapter<TDocument>>(
    options,
    editorStoragePersistenceStrategy,
  );
}

export function useConflictAwareEditorRuntime<TDocument, TSelection = unknown>(
  options: UseConflictAwareEditorRuntimeOptions<TDocument, TSelection>,
): UseConflictAwareEditorRuntimeResult<TDocument, TSelection> {
  return usePersistentEditorRuntimeCore<
    TDocument,
    TSelection,
    EditorConflictStorageAdapter<TDocument>
  >(options, conflictAwarePersistenceStrategy);
}

function usePersistentEditorRuntimeCore<TDocument, TSelection, TStorage>(
  options: UsePersistentEditorRuntimeCoreOptions<TDocument, TSelection, TStorage>,
  strategy: EditorPersistenceStrategy<TDocument, TSelection, TStorage>,
): UsePersistentEditorRuntimeResult<TDocument, TSelection> {
  const runtime = useEditorRuntime<TDocument, TSelection>(options);
  const setRuntimeState = runtime.setState;
  const [persistence, setPersistence] = React.useState(createEditorPersistenceState);
  const runtimeRef = React.useRef(runtime.state);
  const persistenceRef = React.useRef(persistence);
  const storageRef = React.useRef(options.storage);
  const canSaveRef = React.useRef(options.canSave);
  const onPersistenceErrorRef = React.useRef(options.onPersistenceError);
  const onPersistenceEventRef = React.useRef(options.onPersistenceEvent);
  const saveInFlightRef = React.useRef(false);
  const failedSaveRevisionRef = React.useRef<number | null>(null);
  const pendingSaveAfterInFlightRef = React.useRef(false);
  const skippedLatestSaveRevisionRef = React.useRef<number | null>(null);
  const retryTimeoutRef = React.useRef<number | null>(null);
  const mountedRef = React.useRef(true);
  const [saveSignal, setSaveSignal] = React.useState(0);

  runtimeRef.current = runtime.state;
  persistenceRef.current = persistence;
  storageRef.current = options.storage;
  canSaveRef.current = options.canSave;
  onPersistenceErrorRef.current = options.onPersistenceError;
  onPersistenceEventRef.current = options.onPersistenceEvent;

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryTimeoutRef.current !== null) {
        window.clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, []);

  const load = React.useCallback(async () => {
    setPersistence((previous) => strategy.prepareLoad(previous));

    const result = await strategy.load(runtimeRef.current, storageRef.current, {
      onError: onPersistenceErrorRef.current,
      onEvent: onPersistenceEventRef.current,
    });

    if (!mountedRef.current) {
      return;
    }

    setRuntimeState(result.runtime);
    setPersistence(result.persistence);
  }, [setRuntimeState, strategy]);

  const autosaveOptions = normalizeEditorAutosaveOptions(options.autosave);
  const save = React.useCallback(
    async (saveOptions: { force?: boolean } = {}) => {
      const snapshot = runtimeRef.current;
      const canSave = canSaveRef.current ?? (() => true);
      if (skippedLatestSaveRevisionRef.current === snapshot.revision) {
        skippedLatestSaveRevisionRef.current = null;
      }

      if (saveInFlightRef.current) {
        onPersistenceEventRef.current?.({
          reason: "in-flight",
          revision: snapshot.revision,
          type: "save-skipped",
        });
        return false;
      }

      if (!canSave(snapshot)) {
        onPersistenceEventRef.current?.({
          reason: "blocked",
          revision: snapshot.revision,
          type: "save-skipped",
        });
        return false;
      }

      if (snapshot.status === "clean" && !saveOptions.force) {
        const result = await strategy.save(snapshot, storageRef.current, {
          force: saveOptions.force,
          onError: onPersistenceErrorRef.current,
          onEvent: onPersistenceEventRef.current,
          ...strategy.getSaveOptions(persistenceRef.current),
        });

        if (mountedRef.current) {
          setPersistence(result.persistence);
        }

        return result.saved;
      }

      saveInFlightRef.current = true;
      setPersistence((previous) =>
        strategy.prepareSave({
          ...previous,
          operation: "save",
          savingRevision: snapshot.revision,
          status: "saving",
        }),
      );

      const result = await strategy.save(snapshot, storageRef.current, {
        force: saveOptions.force,
        onError: onPersistenceErrorRef.current,
        onEvent: onPersistenceEventRef.current,
        ...strategy.getSaveOptions(persistenceRef.current),
      });

      saveInFlightRef.current = false;
      if (!mountedRef.current) {
        return result.saved;
      }

      failedSaveRevisionRef.current =
        result.persistence.status === "error" ? result.revision : null;
      setRuntimeState((current) =>
        current.revision === result.revision ? result.runtime : current,
      );
      setPersistence(result.persistence);
      if (
        pendingSaveAfterInFlightRef.current &&
        autosaveOptions.enabled &&
        autosaveOptions.saveLatest
      ) {
        pendingSaveAfterInFlightRef.current = false;
        setSaveSignal((signal) => signal + 1);
      }
      return result.saved;
    },
    [autosaveOptions.enabled, autosaveOptions.saveLatest, setRuntimeState, strategy],
  );

  const saveWithAutosaveRetry = React.useCallback(async () => {
    const revision = runtimeRef.current.revision;
    let attemptsUsed = 0;

    while (true) {
      const saved = await save();
      if (
        saved ||
        !mountedRef.current ||
        runtimeRef.current.revision !== revision ||
        failedSaveRevisionRef.current !== revision ||
        attemptsUsed >= autosaveOptions.retryAttempts
      ) {
        return;
      }

      attemptsUsed += 1;
      await new Promise<void>((resolve) => {
        retryTimeoutRef.current = window.setTimeout(() => {
          retryTimeoutRef.current = null;
          resolve();
        }, autosaveOptions.retryDelayMs);
      });
    }
  }, [autosaveOptions.retryAttempts, autosaveOptions.retryDelayMs, save]);

  const loadOnMount = options.loadOnMount ?? true;

  React.useEffect(() => {
    if (!loadOnMount) {
      return;
    }

    void load();
  }, [load, loadOnMount]);

  React.useEffect(() => {
    if (!autosaveOptions.enabled || runtime.state.status !== "dirty") {
      return;
    }

    if (saveInFlightRef.current) {
      if (autosaveOptions.saveLatest && !pendingSaveAfterInFlightRef.current) {
        pendingSaveAfterInFlightRef.current = true;
        onPersistenceEventRef.current?.({
          reason: "in-flight",
          revision: runtime.state.revision,
          type: "save-skipped",
        });
      }
      if (!autosaveOptions.saveLatest) {
        skippedLatestSaveRevisionRef.current = runtime.state.revision;
      }
      return;
    }

    if (skippedLatestSaveRevisionRef.current === runtime.state.revision) {
      return;
    }

    if (
      persistence.status === "error" &&
      failedSaveRevisionRef.current === runtime.state.revision
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void saveWithAutosaveRetry();
    }, autosaveOptions.delayMs);

    return () => window.clearTimeout(timeout);
  }, [
    autosaveOptions.delayMs,
    autosaveOptions.enabled,
    autosaveOptions.retryAttempts,
    autosaveOptions.retryDelayMs,
    autosaveOptions.saveLatest,
    persistence.status,
    runtime.state.revision,
    runtime.state.status,
    save,
    saveWithAutosaveRetry,
    saveSignal,
  ]);

  return {
    ...runtime,
    load,
    persistence,
    save,
  };
}
