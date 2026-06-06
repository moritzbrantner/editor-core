import { describe, expect, test } from "vitest";
import {
  collapseEditorTreeNode,
  createEditorTreeState,
  expandEditorTreeNode,
  expandEditorTreeAncestors,
  getEditorTreeNodePath,
  projectEditorTree,
  selectAndRevealEditorTreeNode,
  selectEditorTreeNode,
  toggleEditorTreeNode,
  windowEditorTreeItems,
  type EditorTreeAdapter,
} from "./tree.js";

type Document = {
  title: string;
};

const adapter: EditorTreeAdapter<Document, { source: string }> = {
  getRoot(document) {
    return {
      children: [
        {
          children: [
            {
              id: "document.fields.title",
              kind: "field",
              label: "Title",
              metadata: { source: "title" },
              path: ["title"],
            },
          ],
          expandedByDefault: true,
          id: "document.fields",
          kind: "group",
          label: "Fields",
        },
        {
          children: [
            {
              id: "document.hidden.value",
              kind: "field",
              label: document.title,
              selectable: false,
            },
          ],
          id: "document.hidden",
          kind: "group",
          label: "Hidden",
        },
      ],
      expandedByDefault: true,
      id: "document",
      kind: "document",
      label: document.title,
      metadata: { source: "root" },
    };
  },
};

describe("editor tree", () => {
  test("projects nested trees into visible items and honors default expansion", () => {
    const projection = projectEditorTree({ title: "Draft" }, adapter);

    expect(projection.items.map((item) => item.node.id)).toEqual([
      "document",
      "document.fields",
      "document.fields.title",
      "document.hidden",
    ]);
    expect(projection.items.map((item) => item.depth)).toEqual([0, 1, 2, 1]);
    expect(projection.items.find((item) => item.node.id === "document")?.expanded).toBe(true);
    expect(projection.items.find((item) => item.node.id === "document.hidden")?.expanded).toBe(
      false,
    );
  });

  test("uses explicit expansion state for visible items", () => {
    const state = createEditorTreeState({ expandedIds: ["document", "document.hidden"] });
    const projection = projectEditorTree({ title: "Draft" }, adapter, { state });

    expect(projection.items.map((item) => item.node.id)).toEqual([
      "document",
      "document.fields",
      "document.hidden",
      "document.hidden.value",
    ]);
    expect(projection.state).toEqual(state);
  });

  test("expands, collapses, toggles, selects, and deduplicates state immutably", () => {
    const state = createEditorTreeState({
      expandedIds: ["b", "a", "a"],
      selectedId: "a",
    });

    expect(state.expandedIds).toEqual(["a", "b"]);

    const expanded = expandEditorTreeNode(state, "c");
    expect(expanded).toEqual({ expandedIds: ["a", "b", "c"], selectedId: "a" });
    expect(state).toEqual({ expandedIds: ["a", "b"], selectedId: "a" });

    const collapsed = collapseEditorTreeNode(expanded, "b");
    expect(collapsed.expandedIds).toEqual(["a", "c"]);

    expect(toggleEditorTreeNode(collapsed, "c").expandedIds).toEqual(["a"]);
    expect(toggleEditorTreeNode(collapsed, "b").expandedIds).toEqual(["a", "b", "c"]);
    expect(selectEditorTreeNode(collapsed, null).selectedId).toBeNull();
  });

  test("does not mark non-selectable nodes as selected in projections", () => {
    const state = createEditorTreeState({
      expandedIds: ["document", "document.hidden"],
      selectedId: "document.hidden.value",
    });
    const projection = projectEditorTree({ title: "Draft" }, adapter, { state });

    expect(
      projection.items.find((item) => item.node.id === "document.hidden.value")?.selected,
    ).toBe(false);
  });

  test("throws on duplicate node ids", () => {
    const duplicateAdapter: EditorTreeAdapter<Document> = {
      getRoot() {
        return {
          children: [{ id: "document", label: "Duplicate" }],
          id: "document",
          label: "Document",
        };
      },
    };

    expect(() => projectEditorTree({ title: "Draft" }, duplicateAdapter)).toThrow(
      'Duplicate editor tree node id "document".',
    );
  });

  test("preserves adapter ids, paths, kinds, metadata, and parent maps", () => {
    const projection = projectEditorTree({ title: "Draft" }, adapter);
    const title = projection.nodesById.get("document.fields.title");

    expect(title).toMatchObject({
      id: "document.fields.title",
      kind: "field",
      label: "Title",
      metadata: { source: "title" },
      path: ["title"],
    });
    expect(projection.parentIdsById.get("document.fields.title")).toBe("document.fields");
  });

  test("returns node paths and reveals selected descendants", () => {
    const collapsedState = createEditorTreeState();
    const projection = projectEditorTree({ title: "Draft" }, adapter, { state: collapsedState });

    expect(getEditorTreeNodePath(projection, "document.fields.title")).toEqual([
      "document",
      "document.fields",
      "document.fields.title",
    ]);
    expect(getEditorTreeNodePath(projection, "missing")).toEqual([]);

    expect(expandEditorTreeAncestors(collapsedState, projection, "document.fields.title")).toEqual({
      expandedIds: ["document", "document.fields"],
      selectedId: null,
    });
    expect(
      selectAndRevealEditorTreeNode(collapsedState, projection, "document.fields.title"),
    ).toEqual({
      expandedIds: ["document", "document.fields"],
      selectedId: "document.fields.title",
    });
  });

  test("windows visible items for virtualized trees", () => {
    const projection = projectEditorTree({ title: "Draft" }, adapter);

    expect(windowEditorTreeItems(projection.items, { count: 2, start: 1 })).toMatchObject({
      end: 3,
      start: 1,
      total: 4,
    });
    expect(
      windowEditorTreeItems(projection.items, { count: 2, start: 1 }).items.map(
        (item) => item.node.id,
      ),
    ).toEqual(["document.fields", "document.fields.title"]);
  });
});
