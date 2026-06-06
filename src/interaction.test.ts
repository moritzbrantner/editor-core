import { describe, expect, test } from "vitest";
import {
  beginEditorInteraction,
  cancelEditorInteraction,
  commitEditorInteraction,
  commitEditorInteractionOperation,
  createEditorInteractionSession,
  isEditorInteractionActive,
} from "./interaction.js";
import { createEditorOperationRuntime, undoEditorOperationRuntime } from "./operations.js";

describe("editor interactions", () => {
  test("begins, previews, commits, and cancels sessions", () => {
    const session = createEditorInteractionSession({ x: 0 });
    const dragging = beginEditorInteraction(session, {
      ids: ["a"],
      kind: "dragging" as const,
      origin: { x: 0, y: 0 },
    });

    expect(isEditorInteractionActive(dragging.state)).toBe(true);
    expect(commitEditorInteraction({ ...dragging, previewDocument: { x: 10 } })).toEqual({
      committedDocument: { x: 10 },
      previewDocument: { x: 10 },
      state: { kind: "idle" },
    });
    expect(cancelEditorInteraction({ ...dragging, previewDocument: { x: 10 } })).toEqual(session);
  });

  test("commits interaction operations as mergeable transactions", () => {
    let runtime = createEditorOperationRuntime<{ x: number }>({ initialDocument: { x: 0 } });
    runtime = commitEditorInteractionOperation(runtime, {
      apply: () => ({ x: 10 }),
      id: "drag",
      mergeKey: "drag:a",
    });
    runtime = commitEditorInteractionOperation(runtime, {
      apply: () => ({ x: 20 }),
      id: "drag",
      mergeKey: "drag:a",
    });

    expect(runtime.operationHistory.undoStack).toHaveLength(1);
    expect(undoEditorOperationRuntime(runtime).runtime.document).toEqual({ x: 0 });
  });
});
