import { describe, expect, test, vi } from "vitest";
import {
  applyEditorInteractionOperation,
  applyEditorOperation,
  createEditorOperationRuntime,
  createEditorOperationRuntimeCommands,
  readEditorOperationLog,
  redoEditorOperationRuntime,
  serializeEditorOperationLog,
  undoEditorOperationRuntime,
  type EditorOperationLogAdapter,
} from "./operations.js";
import { migrateEditorOperationLog } from "./operations/migrations.js";
import { EditorJsonParseError, EditorMigrationError } from "./serialization.js";

type Document = {
  items: Record<string, { x: number; y: number }>;
};

describe("editor operations", () => {
  test("rejects copied operation runtime state before running transitions", () => {
    const preflight = vi.fn(() => []);
    const apply = vi.fn((document: Document) => document);
    const runtime = createEditorOperationRuntime<Document>({
      initialDocument: { items: { a: { x: 0, y: 0 } } },
      preflight,
    });
    const copiedRuntime = { ...runtime } as typeof runtime;
    const operation = { apply, id: "forged" };

    for (const transition of [
      () => applyEditorOperation(copiedRuntime, operation),
      () => applyEditorInteractionOperation(copiedRuntime, operation),
      () => undoEditorOperationRuntime(copiedRuntime),
      () => redoEditorOperationRuntime(copiedRuntime),
    ]) {
      expect(transition).toThrow(
        "Editor operation runtime state must be created by createEditorOperationRuntime.",
      );
    }
    expect(preflight).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  test("applies, undoes, redoes, and restores selections", () => {
    let runtime = createEditorOperationRuntime<Document, string>({
      initialDocument: { items: { a: { x: 0, y: 0 } } },
      initialSelection: "a",
    });

    runtime = applyEditorOperation(runtime, {
      apply: (document) => ({ items: { a: { x: document.items.a.x + 10, y: 5 } } }),
      id: "move-item",
      label: "Move item",
      selectionAfter: "a",
      selectionBefore: "a",
    });

    expect(runtime.runtime.document.items.a).toEqual({ x: 10, y: 5 });
    expect(runtime.canUndo).toBe(true);

    runtime = undoEditorOperationRuntime(runtime);
    expect(runtime.runtime.document.items.a).toEqual({ x: 0, y: 0 });
    expect(runtime.runtime.selection).toBe("a");
    expect(runtime.canRedo).toBe(true);

    runtime = redoEditorOperationRuntime(runtime);
    expect(runtime.runtime.document.items.a).toEqual({ x: 10, y: 5 });
  });

  test("merges interaction operations into one undoable transaction", () => {
    let runtime = createEditorOperationRuntime<Document, string>({
      initialDocument: { items: { a: { x: 0, y: 0 } } },
    });

    runtime = applyEditorInteractionOperation(runtime, moveItem(10));
    runtime = applyEditorInteractionOperation(runtime, moveItem(25));
    runtime = applyEditorInteractionOperation(runtime, moveItem(40));

    expect(runtime.operationHistory.undoStack).toHaveLength(1);
    expect(runtime.runtime.document.items.a.x).toBe(40);
    expect(undoEditorOperationRuntime(runtime).runtime.document.items.a.x).toBe(0);
  });

  test("does not merge operations with different merge keys", () => {
    let runtime = createEditorOperationRuntime<Document>({
      initialDocument: { items: { a: { x: 0, y: 0 } } },
    });

    runtime = applyEditorOperation(runtime, moveItem(10), { merge: true });
    runtime = applyEditorOperation(
      runtime,
      { ...moveItem(20), mergeKey: "move:b" },
      { merge: true },
    );

    expect(runtime.operationHistory.undoStack).toHaveLength(2);
  });

  test("skips history for no-op operations", () => {
    let runtime = createEditorOperationRuntime<Document>({
      initialDocument: { items: { a: { x: 0, y: 0 } } },
    });

    runtime = applyEditorOperation(runtime, moveItem(10));
    runtime = applyEditorOperation(runtime, {
      apply: (document) => document,
      id: "noop",
    });

    expect(runtime.operationHistory.undoStack.map((transaction) => transaction.id)).toEqual([
      "move-item",
    ]);
  });

  test("preflight blocks errors and keeps warnings non-blocking", () => {
    let runtime = createEditorOperationRuntime<Document>({
      initialDocument: { items: { a: { x: 0, y: 0 } } },
      operationHistoryLimit: 1,
      preflight({ operation }) {
        return operation.id === "blocked"
          ? [{ path: "items.a", message: "Blocked" }]
          : [{ path: "items.a", message: "Large move", severity: "warning" }];
      },
    });

    runtime = applyEditorOperation(runtime, { ...moveItem(10), id: "blocked" });
    expect(runtime.runtime.document.items.a.x).toBe(0);

    runtime = applyEditorOperation(runtime, moveItem(20));
    expect(runtime.runtime.document.items.a.x).toBe(20);
    expect(runtime.issues).toEqual([
      { path: "items.a", message: "Large move", severity: "warning" },
    ]);
  });

  test("retains preflight options after undo and redo", () => {
    let runtime = createEditorOperationRuntime<Document>({
      initialDocument: { items: { a: { x: 0, y: 0 } } },
      preflight({ operation }) {
        return operation.id === "blocked" ? [{ path: "items.a", message: "Blocked" }] : [];
      },
    });

    runtime = applyEditorOperation(runtime, moveItem(10));
    runtime = undoEditorOperationRuntime(runtime);
    runtime = redoEditorOperationRuntime(runtime);
    runtime = applyEditorOperation(runtime, { ...moveItem(20), id: "blocked" });

    expect(runtime.runtime.document.items.a.x).toBe(10);
    expect(runtime.issues).toEqual([{ path: "items.a", message: "Blocked" }]);
  });

  test("creates operation runtime commands for undo and redo", () => {
    let runtime = createEditorOperationRuntime<Document>({
      initialDocument: { items: { a: { x: 0, y: 0 } } },
    });
    const setEditor = (updater: (editor: typeof runtime) => typeof runtime) => {
      runtime = updater(runtime);
    };

    let commands = createEditorOperationRuntimeCommands({ editor: runtime, setEditor });
    expect(commands.map((command) => command.disabled)).toEqual([true, true]);

    runtime = applyEditorOperation(runtime, moveItem(10));
    commands = createEditorOperationRuntimeCommands({ editor: runtime, setEditor });
    commands.find((command) => command.id === "undo")?.run?.(keyboardEvent);
    expect(runtime.runtime.document.items.a.x).toBe(0);
  });

  test("serializes operation logs with metadata", () => {
    expect(
      serializeEditorOperationLog(
        [{ id: "op", payload: { x: 1 }, schemaVersion: 1, type: "move" }],
        { exportedAt: false, format: "@example/ops", schemaVersion: 1 },
      ),
    ).toEqual({
      format: "@example/ops",
      operations: [{ id: "op", payload: { x: 1 }, schemaVersion: 1, type: "move" }],
      schemaVersion: 1,
    });
  });

  test("reads and migrates operation logs", () => {
    const adapter = createOperationLogAdapter();

    expect(
      readEditorOperationLog(
        { format: "@example/ops", operations: [{ value: 2 }], schemaVersion: 1 },
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

  test("migrates operation logs directly and rejects migration cycles", () => {
    const adapter = createOperationLogAdapter();
    const input = { format: "@example/ops", operations: [{ value: 3 }], schemaVersion: 1 };

    expect(
      migrateEditorOperationLog(input, adapter, {
        1: (log) => ({
          ...log,
          operations: [{ amount: 3, type: "move" }],
          schemaVersion: 3,
        }),
      }),
    ).toEqual({
      format: "@example/ops",
      operations: [{ amount: 3, type: "move" }],
      schemaVersion: 3,
    });
    expect(() => migrateEditorOperationLog(input, adapter, { 1: (log) => log })).toThrow(
      EditorMigrationError,
    );
  });
});

function moveItem(x: number) {
  return {
    apply: (document: Document): Document => ({ items: { a: { x, y: document.items.a.y } } }),
    id: "move-item",
    mergeKey: "move:a",
  };
}

function createOperationLogAdapter(): EditorOperationLogAdapter<{ amount: number; type: "move" }> {
  return {
    format: "@example/ops",
    schemaVersion: 3,
    read(input, path = "$") {
      if (!input || typeof input !== "object") {
        throw new EditorJsonParseError([{ path, message: "Expected operation object." }]);
      }
      const operation = input as Record<string, unknown>;
      return { amount: Number(operation.amount), type: "move" };
    },
    validate(operation) {
      return operation.amount >= 0 ? [] : [{ path: "amount", message: "Must be non-negative." }];
    },
  };
}

const keyboardEvent = {
  altKey: false,
  ctrlKey: false,
  key: "z",
  metaKey: true,
  preventDefault() {},
  shiftKey: false,
  target: null,
} as unknown as KeyboardEvent;
