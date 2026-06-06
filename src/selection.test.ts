import { describe, expect, test } from "vitest";
import {
  addEditorEntityToSelection,
  createEditorEntitySelection,
  editorSelectionFromTreeNode,
  getEditorSelectionTreeNodeId,
  normalizeEditorSelection,
  toggleEditorEntitySelection,
} from "./selection.js";

describe("editor selection", () => {
  test("adds, toggles, and normalizes entity selections", () => {
    let selection = createEditorEntitySelection(["a"]);
    selection = addEditorEntityToSelection(selection, "b");
    selection = toggleEditorEntitySelection(selection, "a");

    expect(selection).toEqual({ anchorId: "b", ids: ["b"], kind: "entity" });
    expect(normalizeEditorSelection(selection, (id) => id !== "b")).toEqual({ kind: "empty" });
  });

  test("normalizes stale range and port selections", () => {
    expect(
      normalizeEditorSelection(
        { anchorId: "a", focusId: "missing", kind: "range" },
        (id) => id === "a",
      ),
    ).toEqual({ kind: "empty" });

    expect(
      normalizeEditorSelection({ entityId: "missing", kind: "port", portId: "out" }, () => false),
    ).toEqual({ kind: "empty" });
  });

  test("converts between tree nodes and entity selections", () => {
    const selection = editorSelectionFromTreeNode({
      id: "tree.node",
      label: "Node",
      metadata: { entityId: "node-a" },
    });

    expect(selection).toEqual({ anchorId: "node-a", ids: ["node-a"], kind: "entity" });
    expect(getEditorSelectionTreeNodeId(selection, (id) => `tree.${id}`)).toBe("tree.node-a");
  });
});
