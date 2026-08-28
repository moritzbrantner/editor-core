import { describe, expect, test } from "vitest";
import { createEditorConstraintIssue, validateEditorEntityIssues } from "./constraints.js";

describe("editor constraints", () => {
  test("creates constraint issues with explicit, entity, and fallback paths", () => {
    expect(createEditorConstraintIssue({ message: "Required", path: "document.title" })).toEqual({
      message: "Required",
      path: "document.title",
    });
    expect(createEditorConstraintIssue({ entityId: "item-a", message: "Invalid" })).toEqual({
      message: "Invalid",
      path: "entities.item-a",
    });
    expect(createEditorConstraintIssue({ message: "Invalid" })).toEqual({
      message: "Invalid",
      path: "",
    });
  });

  test("flattens caller-owned validation issues in input order", () => {
    const issues = validateEditorEntityIssues(
      [
        { id: "a", valid: false },
        { id: "b", valid: true },
        { id: "c", valid: false },
      ],
      (entity) =>
        entity.valid
          ? []
          : [
              { path: `entities.${entity.id}`, message: "Invalid entity." },
              { path: `entities.${entity.id}.type`, message: "Invalid type." },
            ],
    );

    expect(issues).toEqual([
      { path: "entities.a", message: "Invalid entity." },
      { path: "entities.a.type", message: "Invalid type." },
      { path: "entities.c", message: "Invalid entity." },
      { path: "entities.c.type", message: "Invalid type." },
    ]);
    expect(validateEditorEntityIssues([], () => [{ path: "never", message: "Never" }])).toEqual([]);
  });
});
