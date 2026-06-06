import * as React from "react";
import type { EditorStorageAdapter } from "./browser.js";
import {
  getEditorCommandIdFromKeyboardEvent,
  isEditorEditableTarget,
  matchesEditorHotkey,
  type EditorCommandDefinition,
  type EditorHotkeyEvent,
} from "./hotkeys.js";
import {
  createEditorPersistenceState,
  loadEditorRuntimePersistence,
  saveEditorRuntimePersistence,
  type EditorPersistenceErrorContext,
  type EditorPersistenceState,
} from "./persistence.js";
import {
  commitEditorRuntime,
  createEditorRuntime,
  markEditorRuntimeSaved,
  redoEditorRuntime,
  resetEditorRuntime,
  setEditorRuntimeSelection,
  undoEditorRuntime,
  type CommitEditorRuntimeOptions,
  type EditorRuntimeOptions,
  type EditorRuntimeSelection,
  type EditorRuntimeState,
  type EditorRuntimeUpdate,
  type ResetEditorRuntimeOptions,
} from "./runtime.js";
import {
  collapseEditorTreeNode,
  createEditorTreeState,
  expandEditorTreeNode,
  selectEditorTreeNode,
  toggleEditorTreeNode,
  type EditorTreeNodeId,
  type EditorTreeState,
} from "./tree.js";

export type ControllableEditorStateOptions<T> = {
  value?: T;
  defaultValue: T | (() => T);
  onChange?: (value: T) => void;
};

export function useControllableEditorState<T>({
  value,
  defaultValue,
  onChange,
}: ControllableEditorStateOptions<T>): [T, (value: T | ((previous: T) => T)) => void] {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const controlled = value !== undefined;
  const currentValue = controlled ? value : internalValue;
  const currentValueRef = React.useRef(currentValue);
  const onChangeRef = React.useRef(onChange);
  currentValueRef.current = currentValue;
  onChangeRef.current = onChange;

  const setValue = React.useCallback(
    (nextValue: T | ((previous: T) => T)) => {
      const previousValue = currentValueRef.current;
      const resolved =
        typeof nextValue === "function"
          ? (nextValue as (previous: T) => T)(previousValue)
          : nextValue;

      if (!controlled) {
        setInternalValue(resolved);
      }
      onChangeRef.current?.(resolved);
    },
    [controlled],
  );

  return [currentValue, setValue];
}

export type UseEditorRuntimeOptions<TDocument, TSelection = unknown> = EditorRuntimeOptions<
  TDocument,
  TSelection
> & {
  value?: EditorRuntimeState<TDocument, TSelection>;
  onChange?: (state: EditorRuntimeState<TDocument, TSelection>) => void;
};

export type UseEditorRuntimeResult<TDocument, TSelection = unknown> = {
  state: EditorRuntimeState<TDocument, TSelection>;
  setState: React.Dispatch<React.SetStateAction<EditorRuntimeState<TDocument, TSelection>>>;
  commit: (
    update: EditorRuntimeUpdate<TDocument, TSelection>,
    options?: CommitEditorRuntimeOptions<TSelection>,
  ) => void;
  undo: () => void;
  redo: () => void;
  reset: (document: TDocument, options?: ResetEditorRuntimeOptions<TSelection>) => void;
  markSaved: () => void;
  setSelection: (selection: EditorRuntimeSelection<TSelection>) => void;
};

export function useEditorRuntime<TDocument, TSelection = unknown>(
  options: UseEditorRuntimeOptions<TDocument, TSelection>,
): UseEditorRuntimeResult<TDocument, TSelection> {
  const [state, setState] = useControllableEditorState({
    defaultValue: () => createEditorRuntime(options),
    onChange: options.onChange,
    value: options.value,
  });

  const commit = React.useCallback(
    (
      update: EditorRuntimeUpdate<TDocument, TSelection>,
      commitOptions?: CommitEditorRuntimeOptions<TSelection>,
    ) => {
      setState((previous) => commitEditorRuntime(previous, update, commitOptions));
    },
    [setState],
  );

  const undo = React.useCallback(() => {
    setState(undoEditorRuntime);
  }, [setState]);

  const redo = React.useCallback(() => {
    setState(redoEditorRuntime);
  }, [setState]);

  const reset = React.useCallback(
    (document: TDocument, resetOptions?: ResetEditorRuntimeOptions<TSelection>) => {
      setState((previous) => resetEditorRuntime(previous, document, resetOptions));
    },
    [setState],
  );

  const markSaved = React.useCallback(() => {
    setState(markEditorRuntimeSaved);
  }, [setState]);

  const setSelection = React.useCallback(
    (selection: EditorRuntimeSelection<TSelection>) => {
      setState((previous) => setEditorRuntimeSelection(previous, selection));
    },
    [setState],
  );

  return {
    commit,
    markSaved,
    redo,
    reset,
    setSelection,
    setState,
    state,
    undo,
  };
}

export type UsePersistentEditorRuntimeOptions<
  TDocument,
  TSelection = unknown,
> = UseEditorRuntimeOptions<TDocument, TSelection> & {
  storage: EditorStorageAdapter<TDocument>;
  autosave?: boolean | { delayMs?: number };
  loadOnMount?: boolean;
  canSave?: (runtime: EditorRuntimeState<TDocument, TSelection>) => boolean;
  onPersistenceError?: (error: unknown, context: EditorPersistenceErrorContext) => void;
};

export type UsePersistentEditorRuntimeResult<
  TDocument,
  TSelection = unknown,
> = UseEditorRuntimeResult<TDocument, TSelection> & {
  persistence: EditorPersistenceState;
  load: () => Promise<void>;
  save: (options?: { force?: boolean }) => Promise<boolean>;
};

const defaultEditorRuntimeAutosaveDelayMs = 750;

export function usePersistentEditorRuntime<TDocument, TSelection = unknown>(
  options: UsePersistentEditorRuntimeOptions<TDocument, TSelection>,
): UsePersistentEditorRuntimeResult<TDocument, TSelection> {
  const runtime = useEditorRuntime<TDocument, TSelection>(options);
  const setRuntimeState = runtime.setState;
  const [persistence, setPersistence] = React.useState(createEditorPersistenceState);
  const runtimeRef = React.useRef(runtime.state);
  const storageRef = React.useRef(options.storage);
  const canSaveRef = React.useRef(options.canSave);
  const onPersistenceErrorRef = React.useRef(options.onPersistenceError);
  const saveInFlightRef = React.useRef(false);
  const failedSaveRevisionRef = React.useRef<number | null>(null);
  const mountedRef = React.useRef(true);

  runtimeRef.current = runtime.state;
  storageRef.current = options.storage;
  canSaveRef.current = options.canSave;
  onPersistenceErrorRef.current = options.onPersistenceError;

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = React.useCallback(async () => {
    setPersistence((previous) => ({
      ...previous,
      error: null,
      operation: "load",
      savingRevision: null,
      status: "loading",
    }));

    const result = await loadEditorRuntimePersistence(runtimeRef.current, storageRef.current, {
      onError: onPersistenceErrorRef.current,
    });

    if (!mountedRef.current) {
      return;
    }

    setRuntimeState(result.runtime);
    setPersistence(result.persistence);
  }, [setRuntimeState]);

  const save = React.useCallback(
    async (saveOptions: { force?: boolean } = {}) => {
      const snapshot = runtimeRef.current;
      const canSave = canSaveRef.current ?? (() => true);

      if (saveInFlightRef.current || !canSave(snapshot)) {
        return false;
      }

      if (snapshot.status === "clean" && !saveOptions.force) {
        const result = await saveEditorRuntimePersistence(snapshot, storageRef.current, {
          force: saveOptions.force,
          onError: onPersistenceErrorRef.current,
        });

        if (mountedRef.current) {
          setPersistence(result.persistence);
        }

        return result.saved;
      }

      saveInFlightRef.current = true;
      setPersistence((previous) => ({
        ...previous,
        error: null,
        operation: "save",
        savingRevision: snapshot.revision,
        status: "saving",
      }));

      const result = await saveEditorRuntimePersistence(snapshot, storageRef.current, {
        force: saveOptions.force,
        onError: onPersistenceErrorRef.current,
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
      return result.saved;
    },
    [setRuntimeState],
  );

  const loadOnMount = options.loadOnMount ?? true;

  React.useEffect(() => {
    if (!loadOnMount) {
      return;
    }

    void load();
  }, [load, loadOnMount]);

  const autosave = options.autosave ?? true;
  const autosaveEnabled = autosave !== false;
  const autosaveDelayMs =
    typeof autosave === "object"
      ? (autosave.delayMs ?? defaultEditorRuntimeAutosaveDelayMs)
      : defaultEditorRuntimeAutosaveDelayMs;

  React.useEffect(() => {
    if (!autosaveEnabled || runtime.state.status !== "dirty" || saveInFlightRef.current) {
      return;
    }

    if (
      persistence.status === "error" &&
      failedSaveRevisionRef.current === runtime.state.revision
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void save();
    }, autosaveDelayMs);

    return () => window.clearTimeout(timeout);
  }, [
    autosaveDelayMs,
    autosaveEnabled,
    persistence.status,
    runtime.state.revision,
    runtime.state.status,
    save,
  ]);

  return {
    ...runtime,
    load,
    persistence,
    save,
  };
}

export type UseEditorHotkeysOptions<TId extends string> = {
  commands: readonly EditorCommandDefinition<TId>[];
  disabled?: boolean;
  readOnly?: boolean;
  allowEditableTargets?: boolean;
  scopeRef?: React.RefObject<HTMLElement | null>;
};

export function useEditorHotkeys<TId extends string>({
  commands,
  disabled = false,
  readOnly = false,
  allowEditableTargets = false,
  scopeRef,
}: UseEditorHotkeysOptions<TId>): void {
  React.useEffect(() => {
    if (disabled || readOnly || typeof document === "undefined") {
      return;
    }

    const target = scopeRef?.current ?? document;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!allowEditableTargets && isEditorEditableTarget(event.target)) {
        return;
      }

      const commandId = allowEditableTargets
        ? (commands.find(
            (command) =>
              !command.disabled &&
              command.hotkeys?.some((hotkey) => matchesEditorHotkey(event, hotkey)),
          )?.id ?? null)
        : getEditorCommandIdFromKeyboardEvent(event as EditorHotkeyEvent, commands);
      const command = commands.find((candidate) => candidate.id === commandId);
      if (!command?.run) {
        return;
      }

      event.preventDefault();
      void command.run(event as EditorHotkeyEvent);
    };

    target.addEventListener("keydown", onKeyDown as EventListener);
    return () => target.removeEventListener("keydown", onKeyDown as EventListener);
  }, [allowEditableTargets, commands, disabled, readOnly, scopeRef]);
}

export type UseEditorTreeStateResult = {
  state: EditorTreeState;
  setState: React.Dispatch<React.SetStateAction<EditorTreeState>>;
  select: (id: EditorTreeNodeId | null) => void;
  expand: (id: EditorTreeNodeId) => void;
  collapse: (id: EditorTreeNodeId) => void;
  toggle: (id: EditorTreeNodeId) => void;
};

export function useEditorTreeState(
  initialState: Partial<EditorTreeState> = {},
): UseEditorTreeStateResult {
  const [state, setState] = React.useState<EditorTreeState>(() =>
    createEditorTreeState(initialState),
  );

  const select = React.useCallback((id: EditorTreeNodeId | null) => {
    setState((previous) => selectEditorTreeNode(previous, id));
  }, []);

  const expand = React.useCallback((id: EditorTreeNodeId) => {
    setState((previous) => expandEditorTreeNode(previous, id));
  }, []);

  const collapse = React.useCallback((id: EditorTreeNodeId) => {
    setState((previous) => collapseEditorTreeNode(previous, id));
  }, []);

  const toggle = React.useCallback((id: EditorTreeNodeId) => {
    setState((previous) => toggleEditorTreeNode(previous, id));
  }, []);

  return {
    collapse,
    expand,
    select,
    setState,
    state,
    toggle,
  };
}
