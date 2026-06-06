import { describe, expect, test } from "vitest";
import {
  applyEditorPatch,
  diffEditorJson,
  invertEditorPatch,
  isEditorPatchEmpty,
} from "./patches.js";

describe("editor patches", () => {
  test("diffs primitive replacements", () => {
    expect(diffEditorJson("draft", "published")).toEqual([
      { oldValue: "draft", op: "replace", path: [], value: "published" },
    ]);
  });

  test("can omit old values from diffs", () => {
    expect(
      diffEditorJson(
        { removed: true, title: "Draft" },
        { added: 1, title: "Published" },
        { includeOldValues: false },
      ),
    ).toEqual([
      { op: "remove", path: ["removed"] },
      { op: "replace", path: ["title"], value: "Published" },
      { op: "add", path: ["added"], value: 1 },
    ]);
  });

  test("diffs object additions, removals, and replacements", () => {
    expect(
      diffEditorJson({ removed: true, title: "Draft" }, { added: 1, title: "Published" }),
    ).toEqual([
      { oldValue: true, op: "remove", path: ["removed"] },
      { oldValue: "Draft", op: "replace", path: ["title"], value: "Published" },
      { op: "add", path: ["added"], value: 1 },
    ]);
  });

  test("diffs array additions, removals, and replacements conservatively", () => {
    expect(diffEditorJson(["a", "b", "c"], ["a", "beta", "d", "e"])).toEqual([
      { oldValue: "b", op: "replace", path: [1], value: "beta" },
      { oldValue: "c", op: "replace", path: [2], value: "d" },
      { op: "add", path: [3], value: "e" },
    ]);

    expect(diffEditorJson(["a", "b", "c"], ["a"])).toEqual([
      { oldValue: "c", op: "remove", path: [2] },
      { oldValue: "b", op: "remove", path: [1] },
    ]);
  });

  test("applies patches immutably", () => {
    const document = { nodes: [{ id: "a", x: 0 }], title: "Draft" };
    const next = applyEditorPatch(document, [
      { op: "replace", path: ["nodes", 0, "x"], value: 10 },
      { op: "add", path: ["status"], value: "dirty" },
    ]);

    expect(next).toEqual({
      nodes: [{ id: "a", x: 10 }],
      status: "dirty",
      title: "Draft",
    });
    expect(document).toEqual({ nodes: [{ id: "a", x: 0 }], title: "Draft" });
  });

  test("inverts patches back to the original value", () => {
    const before = { nodes: ["a", "b"], title: "Draft" };
    const after = { nodes: ["a", "beta", "c"], title: "Published" };
    const patch = diffEditorJson(before, after);

    expect(applyEditorPatch(before, patch)).toEqual(after);
    expect(applyEditorPatch(after, invertEditorPatch(patch))).toEqual(before);
  });

  test("does not guarantee inversion without old values", () => {
    const before = { nodes: ["a", "b"], title: "Draft" };
    const after = { nodes: ["a", "beta"], title: "Published" };
    const patch = diffEditorJson(before, after, { includeOldValues: false });

    expect(applyEditorPatch(before, patch)).toEqual(after);
    expect(applyEditorPatch(after, invertEditorPatch(patch))).not.toEqual(before);
  });

  test("applies strict root replacements and removals", () => {
    expect(
      applyEditorPatch(
        { title: "Draft" },
        [{ op: "replace", path: [], value: { title: "Published" } }],
        { strict: true },
      ),
    ).toEqual({ title: "Published" });
    expect(
      applyEditorPatch(
        { title: "Draft" },
        [{ oldValue: { title: "Draft" }, op: "remove", path: [] }],
        { strict: true },
      ),
    ).toBeUndefined();
  });

  test("handles impossible paths in strict and non-strict modes", () => {
    const document = { title: "Draft" };
    const patch = [{ op: "replace" as const, path: ["missing", "title"], value: "Next" }];

    expect(applyEditorPatch(document, patch)).toBe(document);
    expect(() => applyEditorPatch(document, patch, { strict: true })).toThrow(
      "Cannot apply editor patch",
    );
  });

  test("produces an empty patch for equal values", () => {
    const patch = diffEditorJson({ title: "Draft" }, { title: "Draft" });

    expect(patch).toEqual([]);
    expect(isEditorPatchEmpty(patch)).toBe(true);
  });
});
