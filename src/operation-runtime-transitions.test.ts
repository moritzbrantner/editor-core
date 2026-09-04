import { describe, expect, test } from "vitest";
import {
  applyEditorOperation,
  createEditorOperationRuntime,
  replaceEditorOperationRuntimeCoreState,
  undoEditorOperationRuntime,
} from "./operations.js";
import { resetEditorRuntime } from "./runtime.js";

describe("operation runtime transitions", () => {
  test("applies semantic changes without recording a new operation-history entry", () => {
    let editor = createEditorOperationRuntime<{ value: number }>({
      initialDocument: { value: 0 },
    });
    editor = applyEditorOperation(editor, {
      id: "recorded",
      apply: () => ({ value: 1 }),
    });
    const history = editor.operationHistory;

    editor = applyEditorOperation(
      editor,
      {
        id: "unrecorded",
        apply: () => ({ value: 2 }),
      },
      { recordHistory: false },
    );

    expect(editor.runtime.document).toEqual({ value: 2 });
    expect(editor.operationHistory).toBe(history);
    expect(editor.operationHistory.undoStack).toHaveLength(1);
    expect(editor.canUndo).toBe(true);
    expect(undoEditorOperationRuntime(editor).runtime.document).toEqual({ value: 0 });
  });

  test("preserves operation issues unless explicitly cleared", () => {
    let editor = createEditorOperationRuntime<{ value: number }>({
      initialDocument: { value: 0 },
      preflight: () => [{ path: "$", message: "Blocked" }],
    });
    editor = applyEditorOperation(editor, {
      id: "blocked",
      apply: () => ({ value: 1 }),
    });
    expect(editor.issues).toEqual([{ path: "$", message: "Blocked" }]);

    const replacement = resetEditorRuntime(editor.runtime, { value: 9 });
    editor = replaceEditorOperationRuntimeCoreState(editor, replacement);
    expect(editor.issues).toEqual([{ path: "$", message: "Blocked" }]);

    editor = replaceEditorOperationRuntimeCoreState(editor, replacement, { clearIssues: true });
    expect(editor.issues).toEqual([]);
  });

  test("replaces core runtime state without breaking opaque runtime ownership", () => {
    let editor = createEditorOperationRuntime<{ value: number }, string>({
      initialDocument: { value: 0 },
      initialSelection: "a",
    });
    editor = applyEditorOperation(editor, {
      id: "recorded",
      apply: () => ({ value: 1 }),
      selectionAfter: "b",
    });

    const resetRuntime = resetEditorRuntime(
      editor.runtime,
      { value: 9 },
      {
        markSaved: true,
        selection: "c",
      },
    );
    editor = replaceEditorOperationRuntimeCoreState(editor, resetRuntime, {
      clearOperationHistory: true,
    });

    expect(editor.runtime.document).toEqual({ value: 9 });
    expect(editor.runtime.selection).toBe("c");
    expect(editor.operationHistory.undoStack).toEqual([]);
    expect(editor.canUndo).toBe(false);
    expect(editor.lastMergeKey).toBeNull();

    editor = applyEditorOperation(editor, {
      id: "after-replace",
      apply: () => ({ value: 10 }),
    });
    expect(editor.runtime.document).toEqual({ value: 10 });
    expect(editor.canUndo).toBe(true);
  });
});
