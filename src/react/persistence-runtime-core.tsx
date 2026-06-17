import * as React from "react";
import type { EditorStorageAdapter } from "../browser.js";
import {
  createEditorPersistenceState,
  createEditorRuntimeConflictPersistenceController,
  createEditorRuntimePersistenceController,
  type EditorConflictStorageAdapter,
  type EditorPersistenceErrorContext,
  type EditorPersistenceEventHandler,
  type EditorPersistenceState,
  type EditorRuntimePersistenceController,
} from "../persistence.js";
import type {
  UsePersistentEditorRuntimeCoreOptions,
  UsePersistentEditorRuntimeResult,
} from "./persistence-hook-types.js";
import { useEditorRuntime } from "./runtime-hooks.js";

export function usePersistentEditorRuntimeCore<TDocument, TSelection, TStorage>(
  options: UsePersistentEditorRuntimeCoreOptions<TDocument, TSelection, TStorage>,
  controllerKind: "storage" | "conflict",
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
  const autosaveRef = React.useRef(options.autosave);
  const controllerRef = React.useRef<EditorRuntimePersistenceController<
    TDocument,
    TSelection
  > | null>(null);

  runtimeRef.current = runtime.state;
  persistenceRef.current = persistence;
  storageRef.current = options.storage;
  canSaveRef.current = options.canSave;
  onPersistenceErrorRef.current = options.onPersistenceError;
  onPersistenceEventRef.current = options.onPersistenceEvent;
  autosaveRef.current = options.autosave;

  if (!controllerRef.current) {
    controllerRef.current = createPersistentRuntimeController(
      controllerKind,
      runtimeRef,
      persistenceRef,
      storageRef,
      canSaveRef,
      onPersistenceErrorRef,
      onPersistenceEventRef,
      autosaveRef,
      setRuntimeState,
      setPersistence,
    );
  }

  controllerRef.current.updateOptions({
    autosave: options.autosave,
    canSave: options.canSave,
    onError: options.onPersistenceError,
    onEvent: options.onPersistenceEvent,
    storage: options.storage as never,
  });

  React.useEffect(() => {
    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  const load = React.useCallback(async () => {
    await controllerRef.current?.load();
  }, []);
  const save = React.useCallback(async (saveOptions: { force?: boolean } = {}) => {
    return (await controllerRef.current?.save(saveOptions)) ?? false;
  }, []);

  const loadOnMount = options.loadOnMount ?? true;

  React.useEffect(() => {
    if (!loadOnMount) {
      return;
    }

    void load();
  }, [load, loadOnMount]);

  React.useEffect(() => {
    controllerRef.current?.notifyRuntimeChanged();
  }, [options.autosave, persistence.status, runtime.state.revision, runtime.state.status]);

  return {
    ...runtime,
    load,
    persistence,
    save,
  };
}

function createPersistentRuntimeController<TDocument, TSelection, TStorage>(
  controllerKind: "storage" | "conflict",
  runtimeRef: React.RefObject<ReturnType<typeof useEditorRuntime<TDocument, TSelection>>["state"]>,
  persistenceRef: React.RefObject<EditorPersistenceState>,
  storageRef: React.RefObject<TStorage>,
  canSaveRef: React.RefObject<
    | ((runtime: ReturnType<typeof useEditorRuntime<TDocument, TSelection>>["state"]) => boolean)
    | undefined
  >,
  onPersistenceErrorRef: React.RefObject<
    ((error: unknown, context: EditorPersistenceErrorContext) => void) | undefined
  >,
  onPersistenceEventRef: React.RefObject<EditorPersistenceEventHandler | undefined>,
  autosaveRef: React.RefObject<
    UsePersistentEditorRuntimeCoreOptions<TDocument, TSelection, TStorage>["autosave"]
  >,
  setRuntimeState: ReturnType<typeof useEditorRuntime<TDocument, TSelection>>["setState"],
  setPersistence: React.Dispatch<React.SetStateAction<EditorPersistenceState>>,
): EditorRuntimePersistenceController<TDocument, TSelection> {
  const commonOptions = {
    autosave: autosaveRef.current,
    canSave: (runtime: ReturnType<typeof useEditorRuntime<TDocument, TSelection>>["state"]) =>
      canSaveRef.current?.(runtime) ?? true,
    getPersistence: () => persistenceRef.current,
    getRuntime: () => runtimeRef.current,
    onError: (error: unknown, context: EditorPersistenceErrorContext) =>
      onPersistenceErrorRef.current?.(error, context),
    onEvent: (event: Parameters<EditorPersistenceEventHandler>[0]) =>
      onPersistenceEventRef.current?.(event),
    setPersistence,
    setRuntime: setRuntimeState,
  };

  if (controllerKind === "conflict") {
    return createEditorRuntimeConflictPersistenceController({
      ...commonOptions,
      storage: storageRef.current as EditorConflictStorageAdapter<TDocument>,
    });
  }

  return createEditorRuntimePersistenceController({
    ...commonOptions,
    storage: storageRef.current as TStorage extends EditorStorageAdapter<TDocument>
      ? TStorage
      : never,
  });
}
