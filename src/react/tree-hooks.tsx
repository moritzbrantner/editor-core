import * as React from "react";
import {
  collapseEditorTreeNode,
  createEditorTreeState,
  expandEditorTreeNode,
  selectEditorTreeNode,
  toggleEditorTreeNode,
  type EditorTreeNodeId,
  type EditorTreeState,
} from "../tree.js";

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
