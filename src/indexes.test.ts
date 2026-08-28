import { describe, expect, test } from "vitest";
import { createEditorEntityDocument, createIncrementingEditorIdFactory } from "./entities.js";
import { createEditorEntityIndexes, groupEditorValidationIssuesByEntityId } from "./indexes.js";

describe("editor indexes", () => {
  test("creates deterministic incrementing ids", () => {
    const createId = createIncrementingEditorIdFactory({ prefix: "node" });

    expect(createId()).toBe("node-1");
    expect(createId("edge")).toBe("edge-2");
  });

  test("rejects duplicate entity ids", () => {
    expect(() =>
      createEditorEntityDocument([
        { id: "duplicate", type: "item" },
        { id: "duplicate", type: "item" },
      ]),
    ).toThrow('Duplicate editor entity id "duplicate".');
  });

  test("indexes nested entity documents by parent and order", () => {
    const document = createEditorEntityDocument([
      { id: "b", order: 2, parentId: null, type: "item" },
      { id: "a", order: 1, parentId: null, type: "item" },
      { id: "a.child", order: 1, parentId: "a", type: "item" },
    ]);
    const indexes = createEditorEntityIndexes(document);

    expect(indexes.orderedRootIds).toEqual(["a", "b"]);
    expect(indexes.childrenByParentId.get(null)?.map((entity) => entity.id)).toEqual(["a", "b"]);
    expect(indexes.parentByChildId.get("a.child")).toBe("a");
  });

  test("does not mutate root id order while returning ordered roots", () => {
    const document = createEditorEntityDocument(
      [
        { id: "b", order: 2, parentId: null, type: "item" },
        { id: "a", order: 1, parentId: null, type: "item" },
      ],
      ["b", "a"],
    );
    const indexes = createEditorEntityIndexes(document);

    expect(document.rootIds).toEqual(["b", "a"]);
    expect(indexes.orderedRootIds).toEqual(["a", "b"]);
  });

  test("sorts existing child groups in deterministic numeric order", () => {
    const document = createEditorEntityDocument([
      { id: "parent", order: 1, parentId: null, type: "item" },
      { id: "child-10", order: "10", parentId: "parent", type: "item" },
      { id: "child-2", order: "2", parentId: "parent", type: "item" },
    ]);
    const indexes = createEditorEntityIndexes(document);

    expect(indexes.childrenByParentId.get("parent")?.map((entity) => entity.id)).toEqual([
      "child-2",
      "child-10",
    ]);
  });

  test("groups validation issues by entity id", () => {
    const grouped = groupEditorValidationIssuesByEntityId([
      { message: "Missing", path: "entities.node-a.label" },
      { message: "Invalid", path: "entities['node-b'].value" },
      { message: "Document", path: "title" },
    ]);

    expect(grouped.get("node-a")?.map((issue) => issue.message)).toEqual(["Missing"]);
    expect(grouped.get("node-b")?.map((issue) => issue.message)).toEqual(["Invalid"]);
  });
});
