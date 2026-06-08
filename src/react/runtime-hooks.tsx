import * as React from "react";
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
} from "../runtime.js";

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
