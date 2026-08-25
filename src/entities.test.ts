import { describe, expect, test } from "vitest";
import {
  createEditorEntityDocument,
  createIncrementingEditorIdFactory,
  createUniqueEditorId,
  getEditorEntity,
  isEditorEntityId,
} from "./entities.js";

describe("editor entities", () => {
  test("creates entity documents with default and explicit roots", () => {
    const root = { id: "root", metadata: { label: "Root" }, order: 1, type: "layer" };
    const orphan = { id: "orphan", parentId: null, type: "layer" };
    const child = { id: "child", parentId: "root", type: "layer" };
    const document = createEditorEntityDocument([root, orphan, child]);

    expect(document.entities).toEqual({
      child,
      orphan,
      root,
    });
    expect(document.rootIds).toEqual(["root", "orphan"]);
    expect(document.entities.root).toBe(root);

    expect(createEditorEntityDocument([root, orphan, child], ["orphan"]).rootIds).toEqual([
      "orphan",
    ]);
  });

  test("rejects duplicate entity ids", () => {
    expect(() =>
      createEditorEntityDocument([
        { id: "layer-a", type: "layer" },
        { id: "layer-a", type: "group" },
      ]),
    ).toThrow('Duplicate editor entity id "layer-a".');
  });

  test("gets entities by id and returns null for missing ids", () => {
    const entity = { id: "layer-a", type: "layer" };
    const document = createEditorEntityDocument([entity]);

    expect(getEditorEntity(document, "layer-a")).toBe(entity);
    expect(getEditorEntity(document, "missing")).toBeNull();
  });

  test("identifies non-empty string entity ids", () => {
    expect(isEditorEntityId("entity-a")).toBe(true);
    expect(isEditorEntityId("")).toBe(false);
    expect(isEditorEntityId(null)).toBe(false);
    expect(isEditorEntityId(undefined)).toBe(false);
    expect(isEditorEntityId(1)).toBe(false);
    expect(isEditorEntityId({ id: "entity-a" })).toBe(false);
  });

  test("creates incrementing ids with default, configured, and per-call prefixes", () => {
    const defaultFactory = createIncrementingEditorIdFactory();
    expect(defaultFactory()).toBe("entity-1");
    expect(defaultFactory()).toBe("entity-2");

    const factory = createIncrementingEditorIdFactory({ prefix: "node" });
    expect(factory()).toBe("node-1");
    expect(factory("edge")).toBe("edge-2");
    expect(factory()).toBe("node-3");
  });

  test("creates unique ids from unused bases", () => {
    expect(createUniqueEditorId("node", new Set(["other"]))).toBe("node");
  });

  test("appends incrementing suffixes when ids collide", () => {
    expect(createUniqueEditorId("node", new Set(["node"]))).toBe("node-2");
    expect(createUniqueEditorId("node", new Set(["node", "node-2"]))).toBe("node-3");
  });

  test("trims ids and falls back for blank bases", () => {
    expect(createUniqueEditorId(" node ", [])).toBe("node");
    expect(createUniqueEditorId("  ", [])).toBe("item");
    expect(createUniqueEditorId("", ["item"])).toBe("item-2");
  });

  test("supports custom fallback, separator, and start index", () => {
    expect(
      createUniqueEditorId(" ", ["layer", "layer_10"], {
        fallback: "layer",
        separator: "_",
        startIndex: 10,
      }),
    ).toBe("layer_11");
  });

  test("accepts set and array existing id inputs", () => {
    expect(createUniqueEditorId("node", new Set(["node"]))).toBe("node-2");
    expect(createUniqueEditorId("node", ["node", "node-2"])).toBe("node-3");
  });
});
