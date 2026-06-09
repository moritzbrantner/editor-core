import { describe, expect, test } from "vitest";
import {
  createEditorCollaborationState,
  hasSeenEditorRemoteOperation,
  markEditorRemoteOperationSeen,
  type EditorRemoteOperation,
} from "./collaboration.js";
import {
  applyEditorOperation,
  createEditorOperationRuntime,
  undoEditorOperationRuntime,
  type EditorOperationRuntimeState,
} from "./operations.js";
import {
  createEditorPersistenceState,
  EditorPersistenceConflictError,
  type EditorPersistenceState,
} from "./persistence.js";
import { commitEditorRuntime, createEditorRuntime } from "./runtime.js";
import {
  acceptLocalEditorPersistenceConflict,
  acceptMergedEditorPersistenceConflict,
  acceptRemoteEditorPersistenceConflict,
  applyEditorRemoteOperations,
  createEditorOperationRemoteApplyAdapter,
  resolveEditorPersistenceConflict,
} from "./sync.js";

type Document = {
  count: number;
  title: string;
};

type RemoteOperation =
  | { amount: number; type: "increment" }
  | { title: string; type: "rename" }
  | { type: "fail" };

const clock = () => "2026-06-06T12:00:00.000Z";

describe("editor sync", () => {
  test("applies remote operations in order and marks only successes as seen", () => {
    const collaboration = createEditorCollaborationState({ clientId: "local" });
    const operations: EditorRemoteOperation<RemoteOperation>[] = [
      { clientId: "remote", id: "one", operation: { amount: 1, type: "increment" } },
      { clientId: "remote", id: "fail", operation: { type: "fail" } },
      { clientId: "remote", id: "two", operation: { amount: 2, type: "increment" } },
    ];

    const result = applyEditorRemoteOperations(
      0,
      collaboration,
      operations,
      createNumberRemoteAdapter(),
    );

    expect(result.state).toBe(3);
    expect(result.applied.map((operation) => operation.id)).toEqual(["one", "two"]);
    expect(result.failed.map((entry) => entry.operation.id)).toEqual(["fail"]);
    expect(hasSeenEditorRemoteOperation(result.collaboration, "one")).toBe(true);
    expect(hasSeenEditorRemoteOperation(result.collaboration, "two")).toBe(true);
    expect(hasSeenEditorRemoteOperation(result.collaboration, "fail")).toBe(false);
  });

  test("ignores local-client operations and marks them seen", () => {
    const collaboration = createEditorCollaborationState({ clientId: "local" });
    const result = applyEditorRemoteOperations(
      0,
      collaboration,
      [{ clientId: "local", id: "local-op", operation: { amount: 1, type: "increment" } }],
      createNumberRemoteAdapter(),
    );

    expect(result.state).toBe(0);
    expect(result.skipped.map((operation) => operation.id)).toEqual(["local-op"]);
    expect(hasSeenEditorRemoteOperation(result.collaboration, "local-op")).toBe(true);
  });

  test("does not mark failed decode operations as seen", () => {
    const collaboration = createEditorCollaborationState({ clientId: "local" });
    const result = applyEditorRemoteOperations(
      0,
      collaboration,
      [{ clientId: "remote", id: "decode-fail", operation: { type: "fail" } }],
      {
        apply: (state) => state,
        decode() {
          throw new Error("decode failed");
        },
      },
    );

    expect(result.failed).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      message: "decode failed",
      operationId: "decode-fail",
      severity: "error",
    });
    expect(hasSeenEditorRemoteOperation(result.collaboration, "decode-fail")).toBe(false);
  });

  test("preserves retryability for failed operations", () => {
    const collaboration = createEditorCollaborationState({ clientId: "local" });
    const operation = {
      clientId: "remote",
      id: "retry",
      operation: { type: "fail" },
    } satisfies EditorRemoteOperation<RemoteOperation>;

    const first = applyEditorRemoteOperations(
      0,
      collaboration,
      [operation],
      createNumberRemoteAdapter(),
    );
    const second = applyEditorRemoteOperations(
      first.state,
      first.collaboration,
      [operation],
      createNumberRemoteAdapter(),
    );

    expect(first.failed).toHaveLength(1);
    expect(second.failed).toHaveLength(1);
    expect(hasSeenEditorRemoteOperation(second.collaboration, "retry")).toBe(false);
  });

  test("keeps duplicates skipped within a batch", () => {
    const collaboration = markEditorRemoteOperationSeen(
      createEditorCollaborationState({ clientId: "local" }),
      "seen",
    );
    const result = applyEditorRemoteOperations(
      0,
      collaboration,
      [
        { clientId: "remote", id: "seen", operation: { amount: 1, type: "increment" } },
        { clientId: "remote", id: "next", operation: { amount: 1, type: "increment" } },
        { clientId: "remote", id: "next", operation: { amount: 1, type: "increment" } },
      ],
      createNumberRemoteAdapter(),
    );

    expect(result.state).toBe(1);
    expect(result.applied.map((operation) => operation.id)).toEqual(["next"]);
    expect(result.skipped.map((operation) => operation.id)).toEqual(["seen", "next"]);
  });

  test("operation runtime adapter updates documents without adding local undo history", () => {
    let editor = createEditor();
    editor = applyEditorOperation(editor, {
      apply: (document) => ({ ...document, count: document.count + 1 }),
      id: "local",
    });
    const undoStack = editor.operationHistory.undoStack;
    const result = applyEditorRemoteOperations(
      editor,
      createEditorCollaborationState({ clientId: "local" }),
      [{ clientId: "remote", id: "remote", operation: { title: "Remote", type: "rename" } }],
      createDocumentRemoteAdapter(),
    );

    expect(result.state.runtime.document).toEqual({ count: 1, title: "Remote" });
    expect(result.state.operationHistory.undoStack).toBe(undoStack);
    expect(result.state.operationHistory.undoStack).toHaveLength(1);
  });

  test("operation runtime adapter preserves local undo across remote apply", () => {
    let editor = createEditor();
    editor = applyEditorOperation(editor, {
      apply: (document) => ({ ...document, count: document.count + 1 }),
      id: "local",
    });
    const result = applyEditorRemoteOperations(
      editor,
      createEditorCollaborationState({ clientId: "local" }),
      [{ clientId: "remote", id: "remote", operation: { title: "Remote", type: "rename" } }],
      createDocumentRemoteAdapter(),
    );
    const undone = undoEditorOperationRuntime(result.state);

    expect(undone.runtime.document).toEqual({ count: 0, title: "Draft" });
  });

  test("operation runtime adapter clears the last merge key", () => {
    let editor = createEditor();
    editor = applyEditorOperation(
      editor,
      {
        apply: (document) => ({ ...document, count: document.count + 1 }),
        id: "drag",
        mergeKey: "drag:node",
      },
      { merge: true },
    );
    const result = applyEditorRemoteOperations(
      editor,
      createEditorCollaborationState({ clientId: "local" }),
      [{ clientId: "remote", id: "remote", operation: { title: "Remote", type: "rename" } }],
      createDocumentRemoteAdapter(),
    );

    expect(editor.lastMergeKey).toBe("drag:node");
    expect(result.state.lastMergeKey).toBeNull();
  });

  test("operation runtime adapter blocks preflight errors and allows warnings", () => {
    const editor = createEditor({
      preflight({ operation }) {
        if (operation.id === "blocked") {
          return [{ path: "title", message: "Blocked" }];
        }
        return [{ path: "title", message: "Allowed warning", severity: "warning" }];
      },
    });
    const collaboration = createEditorCollaborationState({ clientId: "local" });
    const blocked = applyEditorRemoteOperations(
      editor,
      collaboration,
      [{ clientId: "remote", id: "blocked", operation: { title: "Blocked", type: "rename" } }],
      createDocumentRemoteAdapter(),
    );
    const warned = applyEditorRemoteOperations(
      editor,
      collaboration,
      [{ clientId: "remote", id: "warned", operation: { title: "Warned", type: "rename" } }],
      createDocumentRemoteAdapter(),
    );

    expect(blocked.failed).toHaveLength(1);
    expect(blocked.state.runtime.document.title).toBe("Draft");
    expect(hasSeenEditorRemoteOperation(blocked.collaboration, "blocked")).toBe(false);
    expect(warned.applied).toHaveLength(1);
    expect(warned.state.runtime.document.title).toBe("Warned");
    expect(warned.issues).toEqual([
      {
        clientId: "remote",
        message: "Allowed warning",
        operationId: "warned",
        path: "title",
        severity: "warning",
      },
    ]);
  });

  test("accept-local clears conflict and leaves runtime dirty", () => {
    const runtime = createDirtyRuntime({ count: 1, title: "Local" });
    const { conflict, persistence } = createConflictPersistence(runtime.document);
    const result = acceptLocalEditorPersistenceConflict(runtime, persistence);

    expect(result.runtime.status).toBe("dirty");
    expect(result.runtime.document).toEqual({ count: 1, title: "Local" });
    expect(result.persistence.conflict).toBeNull();
    expect(result.persistence.error).toBeNull();
    expect(result.persistence.revisionToken).toBe("server-1");
    expect(persistence.conflict).toBe(conflict);
  });

  test("accept-remote resets runtime, marks clean, and updates revision token", () => {
    const runtime = createDirtyRuntime({ count: 1, title: "Local" });
    const { persistence } = createConflictPersistence(runtime.document);
    const result = acceptRemoteEditorPersistenceConflict(runtime, persistence, {
      now: clock,
      selection: "title",
    });

    expect(result.runtime.document).toEqual({ count: 2, title: "Remote" });
    expect(result.runtime.selection).toBe("title");
    expect(result.runtime.status).toBe("clean");
    expect(result.persistence).toMatchObject({
      conflict: null,
      error: null,
      revisionToken: "server-2",
      savedAt: "2026-06-06T12:00:00.000Z",
      savedRevision: result.runtime.revision,
      status: "saved",
    });
  });

  test("accept-remote throws when no remote document exists", () => {
    const runtime = createDirtyRuntime({ count: 1, title: "Local" });
    const conflict = new EditorPersistenceConflictError("stale revision", {
      local: { document: runtime.document, revisionToken: "server-1" },
    });
    const persistence = {
      ...createEditorPersistenceState(),
      conflict,
      error: conflict,
      revisionToken: "server-1",
      status: "error",
    } satisfies EditorPersistenceState;

    expect(() => acceptRemoteEditorPersistenceConflict(runtime, persistence)).toThrow(
      "Cannot accept remote editor persistence conflict without a remote document.",
    );
  });

  test("accept-merged uses merged document, clears conflict, and leaves runtime dirty", () => {
    const runtime = createDirtyRuntime({ count: 1, title: "Local" });
    const { persistence } = createConflictPersistence(runtime.document);
    const result = acceptMergedEditorPersistenceConflict(runtime, persistence, {
      count: 3,
      title: "Merged",
    });

    expect(result.runtime.document).toEqual({ count: 3, title: "Merged" });
    expect(result.runtime.status).toBe("dirty");
    expect(result.persistence.conflict).toBeNull();
    expect(result.persistence.error).toBeNull();
    expect(result.persistence.revisionToken).toBe("server-1");
  });

  test("accept-merged throws when merged document is missing", () => {
    const runtime = createDirtyRuntime({ count: 1, title: "Local" });
    const { persistence } = createConflictPersistence(runtime.document);

    expect(() =>
      resolveEditorPersistenceConflict(runtime, persistence, { resolution: "merged" }),
    ).toThrow("Cannot accept merged editor persistence conflict without a merged document.");
  });

  test("helpers preserve input object immutability", () => {
    const runtime = createDirtyRuntime({ count: 1, title: "Local" });
    const collaboration = createEditorCollaborationState({ clientId: "local" });
    const { conflict, persistence } = createConflictPersistence(runtime.document);
    const remoteApply = applyEditorRemoteOperations(
      runtime.document,
      collaboration,
      [{ clientId: "remote", id: "remote", operation: { title: "Remote", type: "rename" } }],
      {
        decode: (envelope) => envelope.operation,
        apply: (document, operation) =>
          operation.type === "rename" ? { ...document, title: operation.title } : document,
      },
    );
    const resolved = acceptRemoteEditorPersistenceConflict(runtime, persistence, { now: clock });

    expect(runtime.document).toEqual({ count: 1, title: "Local" });
    expect(runtime.status).toBe("dirty");
    expect(collaboration.seenOperationIds).toEqual([]);
    expect(persistence.conflict).toBe(conflict);
    expect(remoteApply.state).not.toBe(runtime.document);
    expect(remoteApply.collaboration).not.toBe(collaboration);
    expect(resolved.persistence).not.toBe(persistence);
    expect(resolved.runtime).not.toBe(runtime);
  });
});

function createNumberRemoteAdapter() {
  return {
    decode(envelope: EditorRemoteOperation<RemoteOperation>) {
      return envelope.operation;
    },
    apply(state: number, operation: RemoteOperation) {
      if (operation.type === "fail") {
        throw new Error("apply failed");
      }
      if (operation.type === "rename") {
        return state;
      }
      return state + operation.amount;
    },
  };
}

function createDocumentRemoteAdapter() {
  return createEditorOperationRemoteApplyAdapter<Document, string, RemoteOperation>({
    decode(envelope) {
      if (envelope.operation.type !== "rename") {
        throw new Error("Expected rename operation.");
      }
      const { title } = envelope.operation;
      return {
        apply: (document) => ({ ...document, title }),
        id: envelope.id,
        selectionAfter: "title",
      };
    },
  });
}

function createEditor(
  options: Partial<Parameters<typeof createEditorOperationRuntime<Document, string>>[0]> = {},
): EditorOperationRuntimeState<Document, string> {
  return createEditorOperationRuntime<Document, string>({
    initialDocument: { count: 0, title: "Draft" },
    ...options,
  });
}

function createDirtyRuntime(document: Document) {
  return commitEditorRuntime(
    createEditorRuntime<Document, string>({
      initialDocument: { count: 0, title: "Draft" },
    }),
    document,
  );
}

function createConflictPersistence(localDocument: Document): {
  conflict: EditorPersistenceConflictError;
  persistence: EditorPersistenceState;
} {
  const conflict = new EditorPersistenceConflictError("stale revision", {
    local: { document: localDocument, revisionToken: "server-1" },
    remote: { document: { count: 2, title: "Remote" }, revisionToken: "server-2" },
  });
  return {
    conflict,
    persistence: {
      ...createEditorPersistenceState(),
      conflict,
      error: conflict,
      revisionToken: "server-1",
      status: "error",
    },
  };
}
