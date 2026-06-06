import { describe, expect, test, vi } from "vitest";
import {
  clampEditorTimelineRange,
  createEditorConstraintIssue,
  validateEditorEntityIssues,
  validateEditorGraphConnection,
  validateEditorTimelineRange,
} from "./constraints.js";

describe("editor constraints", () => {
  test("creates constraint issues with explicit, entity, and fallback paths", () => {
    expect(createEditorConstraintIssue({ message: "Required", path: "document.title" })).toEqual({
      message: "Required",
      path: "document.title",
    });
    expect(createEditorConstraintIssue({ entityId: "node-a", message: "Invalid" })).toEqual({
      message: "Invalid",
      path: "entities.node-a",
    });
    expect(createEditorConstraintIssue({ message: "Invalid" })).toEqual({
      message: "Invalid",
      path: "",
    });
  });

  test("flattens entity validation issues in input order", () => {
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

  test("validates graph connections and prioritizes self-connection failures", () => {
    expect(validateEditorGraphConnection({ sourceId: "a", targetId: "b" })).toEqual([]);
    expect(validateEditorGraphConnection({ sourceId: "a", targetId: "a" })).toEqual([
      { path: "connection", message: "Connections must target a different entity." },
    ]);
    expect(
      validateEditorGraphConnection(
        { sourceId: "a", targetId: "a" },
        { allowSelfConnection: true },
      ),
    ).toEqual([]);
    expect(
      validateEditorGraphConnection(
        { sourceId: "a", targetId: "b" },
        { canConnect: () => false, path: "edges.draft" },
      ),
    ).toEqual([{ path: "edges.draft", message: "Connection is not allowed." }]);

    const canConnect = vi.fn(() => false);
    expect(validateEditorGraphConnection({ sourceId: "a", targetId: "a" }, { canConnect })).toEqual(
      [{ path: "connection", message: "Connections must target a different entity." }],
    );
    expect(canConnect).not.toHaveBeenCalled();
  });

  test("validates timeline ranges with duration and boundary issues", () => {
    expect(validateEditorTimelineRange({ start: 0, end: 10 })).toEqual([]);
    expect(validateEditorTimelineRange({ start: 2, end: 2 })).toEqual([
      { path: "range", message: "Range end must be after range start." },
    ]);
    expect(validateEditorTimelineRange({ start: 2, end: 2 }, { allowZeroDuration: true })).toEqual(
      [],
    );
    expect(
      validateEditorTimelineRange(
        { start: -5, end: 15 },
        { max: 10, min: 0, path: "clips.clip-a.range" },
      ),
    ).toEqual([
      { path: "clips.clip-a.range.start", message: "Range start must be at least 0." },
      { path: "clips.clip-a.range.end", message: "Range end must be at most 10." },
    ]);
    expect(validateEditorTimelineRange({ start: 5, end: 4 })).toEqual([
      { path: "range", message: "Range end must be after range start." },
    ]);
  });

  test("clamps timeline ranges while keeping end at or after start", () => {
    expect(clampEditorTimelineRange({ start: 2, end: 8 })).toEqual({ start: 2, end: 8 });
    expect(clampEditorTimelineRange({ start: -5, end: 15 }, { max: 10, min: 0 })).toEqual({
      start: 0,
      end: 10,
    });
    expect(clampEditorTimelineRange({ start: 12, end: 4 }, { max: 10, min: 0 })).toEqual({
      start: 10,
      end: 10,
    });
  });
});
