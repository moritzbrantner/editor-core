import { describe, expect, test } from "vitest";
import {
  canRedoEditorHistory,
  canUndoEditorHistory,
  commitEditorSnapshotHistory,
  createEditorSnapshotHistory,
  createEditorTransactionHistory,
  pushEditorTransactionHistory,
  redoEditorSnapshotHistory,
  redoEditorTransactionHistory,
  resetEditorSnapshotHistory,
  undoEditorSnapshotHistory,
  undoEditorTransactionHistory,
} from "./history.js";

describe("snapshot history", () => {
  test("commits, skips equal documents, undoes, redoes, resets, and exposes flags", () => {
    const normalize = (document: { value: number }) => ({ value: document.value });
    let history = createEditorSnapshotHistory({ value: 1 }, { normalize });

    history = commitEditorSnapshotHistory(history, { value: 1 }, { normalize, equals: deepEqual });
    expect(history.past).toHaveLength(0);

    history = commitEditorSnapshotHistory(history, { value: 2 }, { normalize, equals: deepEqual });
    history = commitEditorSnapshotHistory(history, { value: 3 }, { normalize, equals: deepEqual });
    expect(history.canUndo).toBe(true);
    expect(canUndoEditorHistory(history)).toBe(true);

    history = undoEditorSnapshotHistory(history);
    expect(history.present.value).toBe(2);
    expect(history.canRedo).toBe(true);
    expect(canRedoEditorHistory(history)).toBe(true);

    history = redoEditorSnapshotHistory(history);
    expect(history.present.value).toBe(3);

    history = resetEditorSnapshotHistory({ value: 4 }, { normalize });
    expect(history).toMatchObject({ canRedo: false, canUndo: false, present: { value: 4 } });
  });

  test("honors bounded history and limit zero", () => {
    let history = createEditorSnapshotHistory(1);
    history = commitEditorSnapshotHistory(history, 2, { limit: 1 });
    history = commitEditorSnapshotHistory(history, 3, { limit: 1 });
    expect(history.past).toEqual([2]);

    history = createEditorSnapshotHistory(1);
    history = commitEditorSnapshotHistory(history, 2, { limit: 0 });
    expect(history.past).toEqual([]);
    expect(history.canUndo).toBe(false);
  });
});

describe("transaction history", () => {
  test("pushes, undoes, redoes, and restores selections", () => {
    let history = createEditorTransactionHistory<string, string[]>();
    history = pushEditorTransactionHistory(history, {
      id: "tx",
      before: "before",
      after: "after",
      selectionBefore: ["a"],
      selectionAfter: ["b"],
    });

    const undone = undoEditorTransactionHistory(history, []);
    expect(undone.document).toBe("before");
    expect(undone.selection).toEqual(["a"]);
    expect(undone.transaction?.id).toBe("tx");

    const redone = redoEditorTransactionHistory(undone.history, []);
    expect(redone.document).toBe("after");
    expect(redone.selection).toEqual(["b"]);
  });

  test("handles empty transaction history and limit zero", () => {
    const history = createEditorTransactionHistory<string>();
    expect(undoEditorTransactionHistory(history)).toEqual({ history });
    expect(
      pushEditorTransactionHistory(history, { id: "tx", before: "a", after: "b" }, { limit: 0 }),
    ).toEqual(history);
  });
});

function deepEqual<T>(left: T, right: T) {
  return JSON.stringify(left) === JSON.stringify(right);
}
