import * as React from "react";
import {
  getEditorCommandIdFromKeyboardEvent,
  isEditorEditableTarget,
  matchesEditorHotkey,
  type EditorCommandDefinition,
  type EditorHotkeyEvent,
} from "./hotkeys.js";
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
