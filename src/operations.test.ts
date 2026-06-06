import { describe, expect, test } from "vitest";
import {
  applyEditorOperation,
  createEditorOperationRuntime,
  createEditorOperationRuntimeCommands,
  readEditorOperationLog,
  redoEditorOperationRuntime,
  serializeEditorOperationLog,
  undoEditorOperationRuntime,
} from "./operations.js";
import { EditorJsonParseError, EditorMigrationError } from "./serialization.js";

type Document = {
  nodes: Record<string, { x: number; y: number }>;
};

describe("editor operations", () => {
  test("applies, undoes, redoes, and restores selections", () => {
    let runtime = createEditorOperationRuntime<Document, string>({
      initialDocument: { nodes: { a: { x: 0, y: 0 } } },
      initialSelection: "a",
    });

    runtime = applyEditorOperation(runtime, {
      apply: (document) => ({ nodes: { a: { x: document.nodes.a.x + 10, y: 5 } } }),
      id: "move-node",
      label: "Move node",
      selectionAfter: "a",
      selectionBefore: "a",
    });

    expect(runtime.runtime.document.nodes.a).toEqual({ x: 10, y: 5 });
    expect(runtime.canUndo).toBe(true);
    expect(runtime.runtime.canUndo).toBe(false);

    runtime = undoEditorOperationRuntime(runtime);
    expect(runtime.runtime.document.nodes.a).toEqual({ x: 0, y: 0 });
    expect(runtime.runtime.selection).toBe("a");
    expect(runtime.canRedo).toBe(true);

    runtime = redoEditorOperationRuntime(runtime);
    expect(runtime.runtime.document.nodes.a).toEqual({ x: 10, y: 5 });
    expect(runtime.runtime.selection).toBe("a");
  });

  test("merges drag-like operations into one undoable transaction", () => {
    let runtime = createEditorOperationRuntime<Document, string>({
      initialDocument: { nodes: { a: { x: 0, y: 0 } } },
    });

    runtime = applyEditorOperation(runtime, moveNode(10), { merge: true });
    runtime = applyEditorOperation(runtime, moveNode(25), { merge: true });
    runtime = applyEditorOperation(runtime, moveNode(40), { merge: true });

    expect(runtime.operationHistory.undoStack).toHaveLength(1);
    expect(runtime.runtime.document.nodes.a.x).toBe(40);

    runtime = undoEditorOperationRuntime(runtime);
    expect(runtime.runtime.document.nodes.a.x).toBe(0);
  });

  test("preflight blocks invalid operations and keeps warnings non-blocking", () => {
    const seenIds: string[] = [];
    let runtime = createEditorOperationRuntime<Document>({
      initialDocument: { nodes: { a: { x: 0, y: 0 } } },
      operationHistoryLimit: 1,
      preflight({ operation }) {
        seenIds.push(operation.id);
        return operation.id === "invalid"
          ? [{ path: "entities.a", message: "Invalid move" }]
          : [{ path: "entities.a", message: "Large move", severity: "warning" }];
      },
    });

    runtime = applyEditorOperation(runtime, {
      apply: () => ({ nodes: { a: { x: 100, y: 0 } } }),
      id: "invalid",
    });
    expect(runtime.runtime.document.nodes.a.x).toBe(0);
    expect(runtime.issues).toHaveLength(1);

    runtime = applyEditorOperation(runtime, {
      apply: () => ({ nodes: { a: { x: 100, y: 0 } } }),
      id: "warning",
    });
    expect(runtime.runtime.document.nodes.a.x).toBe(100);
    expect(seenIds).toEqual(["invalid", "warning"]);

    runtime = applyEditorOperation(runtime, {
      apply: () => ({ nodes: { a: { x: 200, y: 0 } } }),
      id: "warning-2",
    });
    expect(runtime.operationHistory.undoStack).toHaveLength(1);
    expect(runtime.operationHistory.undoStack[0]?.id).toBe("warning-2");
  });

  test("retains preflight options after undo and redo transitions", () => {
    const seenIds: string[] = [];
    let runtime = createEditorOperationRuntime<Document>({
      initialDocument: { nodes: { a: { x: 0, y: 0 } } },
      preflight({ operation }) {
        seenIds.push(operation.id);
        return operation.id === "blocked" ? [{ path: "entities.a", message: "Blocked" }] : [];
      },
    });

    runtime = applyEditorOperation(runtime, moveNode(10));
    runtime = undoEditorOperationRuntime(runtime);
    runtime = redoEditorOperationRuntime(runtime);
    runtime = applyEditorOperation(runtime, {
      apply: () => ({ nodes: { a: { x: 20, y: 0 } } }),
      id: "blocked",
    });

    expect(runtime.runtime.document.nodes.a.x).toBe(10);
    expect(runtime.issues).toEqual([{ path: "entities.a", message: "Blocked" }]);
    expect(seenIds).toEqual(["move-node", "blocked"]);
  });

  test("creates operation runtime commands for undo and redo", () => {
    let runtime = createEditorOperationRuntime<Document>({
      initialDocument: { nodes: { a: { x: 0, y: 0 } } },
    });
    const setEditor = createOperationRuntimeSetter(
      () => runtime,
      (nextRuntime) => {
        runtime = nextRuntime;
      },
    );

    let commands = createEditorOperationRuntimeCommands({ editor: runtime, setEditor });
    expect(commands.map((command) => command.disabled)).toEqual([true, true]);

    runtime = applyEditorOperation(runtime, moveNode(10));
    commands = createEditorOperationRuntimeCommands({ editor: runtime, setEditor });
    expect(commands.map((command) => command.id)).toEqual(["undo", "redo"]);
    expect(commands.find((command) => command.id === "undo")?.disabled).toBe(false);

    commands.find((command) => command.id === "undo")?.run?.(keyboardEvent);
    expect(runtime.runtime.document.nodes.a.x).toBe(0);

    commands = createEditorOperationRuntimeCommands({
      disabled: { redo: true },
      editor: runtime,
      labels: { redo: "Forward" },
      setEditor,
    });
    expect(commands.find((command) => command.id === "redo")).toMatchObject({
      disabled: true,
      label: "Forward",
    });
    commands.find((command) => command.id === "redo")?.run?.(keyboardEvent);
    expect(runtime.runtime.document.nodes.a.x).toBe(0);
  });

  test("serializes operation logs with metadata", () => {
    expect(
      serializeEditorOperationLog(
        [{ id: "op", payload: { x: 1 }, schemaVersion: 1, type: "move" }],
        {
          exportedAt: false,
          format: "@example/ops",
          schemaVersion: 1,
        },
      ),
    ).toEqual({
      format: "@example/ops",
      operations: [{ id: "op", payload: { x: 1 }, schemaVersion: 1, type: "move" }],
      schemaVersion: 1,
    });
  });

  test("reads, migrates, and validates operation logs", () => {
    const adapter = createOperationLogAdapter();

    expect(
      readEditorOperationLog(
        {
          format: "@example/ops",
          operations: [{ amount: 1, type: "move" }],
          schemaVersion: 3,
        },
        adapter,
      ),
    ).toEqual([{ amount: 1, type: "move" }]);

    expect(
      readEditorOperationLog(
        {
          format: "@example/ops",
          operations: [{ value: 2 }],
          schemaVersion: 1,
        },
        adapter,
        {
          migrations: {
            1: (input) => ({
              ...input,
              operations: input.operations.map((operation) => ({
                amount: (operation as unknown as { value: number }).value,
              })),
              schemaVersion: 2,
            }),
            2: (input) => ({
              ...input,
              operations: input.operations.map((operation) => ({
                ...(operation as Record<string, unknown>),
                type: "move",
              })),
              schemaVersion: 3,
            }),
          },
        },
      ),
    ).toEqual([{ amount: 2, type: "move" }]);
  });

  test("rejects unsupported and invalid operation logs", () => {
    const adapter = createOperationLogAdapter();

    expect(() =>
      readEditorOperationLog({ format: "@example/ops", operations: [], schemaVersion: 1 }, adapter),
    ).toThrow(EditorMigrationError);

    expect(() =>
      readEditorOperationLog(
        {
          format: "@example/ops",
          operations: [{ amount: -1, type: "move" }],
          schemaVersion: 3,
        },
        adapter,
      ),
    ).toThrow(EditorJsonParseError);
  });
});

function moveNode(x: number) {
  return {
    apply: (document: Document): Document => ({ nodes: { a: { x, y: document.nodes.a.y } } }),
    id: "move-node",
    mergeKey: "drag:a",
    selectionAfter: "a",
    selectionBefore: "a",
  };
}

function createOperationRuntimeSetter<TDocument, TSelection>(
  getEditor: () => ReturnType<typeof createEditorOperationRuntime<TDocument, TSelection>>,
  setEditor: (
    editor: ReturnType<typeof createEditorOperationRuntime<TDocument, TSelection>>,
  ) => void,
) {
  return (
    updater: (
      editor: ReturnType<typeof createEditorOperationRuntime<TDocument, TSelection>>,
    ) => ReturnType<typeof createEditorOperationRuntime<TDocument, TSelection>>,
  ) => {
    setEditor(updater(getEditor()));
  };
}

function createOperationLogAdapter() {
  return {
    format: "@example/ops",
    schemaVersion: 3,
    normalize(operation: { amount: number; type: string }) {
      return {
        amount: operation.amount,
        type: operation.type,
      };
    },
    read(input: unknown) {
      const operation = input as { amount?: unknown; type?: unknown };
      return {
        amount: typeof operation.amount === "number" ? operation.amount : 0,
        type: typeof operation.type === "string" ? operation.type : "unknown",
      };
    },
    validate(operation: { amount: number; type: string }) {
      return operation.amount < 0
        ? [{ path: "operations.0.amount", message: "Amount must be positive." }]
        : [];
    },
  };
}

const keyboardEvent = {
  altKey: false,
  ctrlKey: true,
  key: "z",
  metaKey: false,
  shiftKey: false,
  target: null,
};
