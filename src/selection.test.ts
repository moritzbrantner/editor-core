import { describe, expect, test } from "vitest";
import {
  addEditorEntityToSelection,
  createEditorEntitySelection,
  editorSelectionFromTreeNode,
  getEditorSelectedEntityIds,
  getEditorSelectionPrimaryEntityId,
  getEditorSelectionTreeNodeId,
  isEditorEntitySelected,
  normalizeEditorSelection,
  removeEditorEntityFromSelection,
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

  test("normalizes stale range selections", () => {
    expect(
      normalizeEditorSelection(
        { anchorId: "a", focusId: "missing", kind: "range" },
        (id) => id === "a",
      ),
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

  test("queries selected entity ids across generic selection shapes", () => {
    expect(getEditorSelectedEntityIds(null)).toEqual([]);
    expect(getEditorSelectedEntityIds({ kind: "empty" })).toEqual([]);
    expect(getEditorSelectedEntityIds(createEditorEntitySelection(["a", "b", "a"]))).toEqual([
      "a",
      "b",
    ]);
    expect(getEditorSelectedEntityIds({ anchorId: "a", focusId: "b", kind: "range" })).toEqual([
      "a",
      "b",
    ]);
  });

  test("checks, removes, and resolves primary selected entities", () => {
    const selection = createEditorEntitySelection(["a", "b"], "a");

    expect(isEditorEntitySelected(selection, "a")).toBe(true);
    expect(isEditorEntitySelected(selection, "missing")).toBe(false);
    expect(getEditorSelectionPrimaryEntityId(selection)).toBe("b");
    expect(removeEditorEntityFromSelection(selection, "a")).toEqual({
      anchorId: "b",
      ids: ["b"],
      kind: "entity",
    });
    expect(removeEditorEntityFromSelection(selection, "b")).toEqual({
      anchorId: "a",
      ids: ["a"],
      kind: "entity",
    });
    expect(removeEditorEntityFromSelection(createEditorEntitySelection(["only"]), "only")).toEqual({
      kind: "empty",
    });
    expect(getEditorSelectionPrimaryEntityId({ kind: "empty" })).toBeNull();
  });

  test("normalizes entity selections while preserving surviving anchors", () => {
    expect(
      normalizeEditorSelection(
        createEditorEntitySelection(["a", "b", "b", "", "missing", "c"], "b"),
        (id) => id === "a" || id === "b" || id === "c",
      ),
    ).toEqual({ anchorId: "b", ids: ["a", "b", "c"], kind: "entity" });
  });

  test("falls back to last surviving id when anchor is stale", () => {
    expect(
      normalizeEditorSelection(
        createEditorEntitySelection(["a", "b", "b", "", "missing", "c"], "missing"),
        (id) => id === "a" || id === "b" || id === "c",
      ),
    ).toEqual({ anchorId: "c", ids: ["a", "b", "c"], kind: "entity" });
  });

  test("checks range membership without changing selection shape", () => {
    const rangeSelection = { anchorId: "a", focusId: "b", kind: "range" } as const;

    expect(isEditorEntitySelected(rangeSelection, "b")).toBe(true);
    expect(isEditorEntitySelected(rangeSelection, "missing")).toBe(false);
    expect(rangeSelection).toEqual({ anchorId: "a", focusId: "b", kind: "range" });
  });
});
