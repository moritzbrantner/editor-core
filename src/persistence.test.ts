import { describe, expect, test, vi } from "vitest";
import type { EditorStorageAdapter } from "./browser.js";
import { commitEditorRuntime, createEditorRuntime, type EditorRuntimeState } from "./runtime.js";
import {
  EditorPersistenceConflictError,
  clearEditorPersistenceConflict,
  createEditorPersistenceState,
  loadEditorRuntimeConflictPersistence,
  loadEditorRuntimePersistence,
  saveEditorRuntimeConflictPersistence,
  saveEditorRuntimePersistence,
  type EditorConflictStorageAdapter,
  type EditorPersistedDocument,
  type EditorPersistenceState,
} from "./persistence.js";

type Document = {
  body: string;
  title: string;
};

const clock = () => "2026-06-06T12:00:00.000Z";

describe("editor persistence", () => {
  test("creates default idle persistence state", () => {
    expect(createEditorPersistenceState({ now: clock })).toEqual({
      conflict: null,
      error: null,
      loadedAt: null,
      operation: null,
      revisionToken: null,
      savedAt: null,
      savedRevision: null,
      savingRevision: null,
      status: "idle",
    });
  });

  test("accepts persistence state objects without conflict fields", () => {
    const persistence: EditorPersistenceState = {
      error: null,
      loadedAt: null,
      operation: null,
      savedAt: null,
      savedRevision: null,
      savingRevision: null,
      status: "idle",
    };

    expect(clearEditorPersistenceConflict(persistence)).toMatchObject({
      conflict: null,
      error: null,
      status: "idle",
    });
  });

  test("loads persisted document and marks runtime clean", async () => {
    const onEvent = vi.fn();
    const runtime = commitEditorRuntime(createRuntime(), { body: "Dirty", title: "Dirty" });
    const storage = createMemoryStorage<Document>({ body: "Stored", title: "Stored" });

    const result = await loadEditorRuntimePersistence(runtime, storage, {
      now: clock,
      onEvent,
      selection: "title",
    });

    expect(result.runtime.document).toEqual({ body: "Stored", title: "Stored" });
    expect(result.runtime.selection).toBe("title");
    expect(result.runtime.status).toBe("clean");
    expect(result.runtime.canUndo).toBe(false);
    expect(result.persistence).toMatchObject({
      error: null,
      loadedAt: "2026-06-06T12:00:00.000Z",
      operation: "load",
      savedAt: "2026-06-06T12:00:00.000Z",
      savedRevision: result.runtime.revision,
      status: "loaded",
    });
    expect(onEvent).toHaveBeenCalledWith({ revision: runtime.revision, type: "load-start" });
    expect(onEvent).toHaveBeenCalledWith({
      loadedAt: "2026-06-06T12:00:00.000Z",
      revision: result.runtime.revision,
      type: "load-success",
    });
  });

  test("falls back to current document when storage is empty", async () => {
    const runtime = commitEditorRuntime(createRuntime(), { body: "Current", title: "Current" });
    const storage = createMemoryStorage<Document>(null);

    const result = await loadEditorRuntimePersistence(runtime, storage, { now: clock });

    expect(result.runtime.document).toEqual({ body: "Current", title: "Current" });
    expect(result.runtime.status).toBe("clean");
    expect(result.persistence.status).toBe("loaded");
  });

  test("handles load errors by exposing error state and using fallback document", async () => {
    const onError = vi.fn();
    const onEvent = vi.fn();
    const runtime = createRuntime();
    const storage = createThrowingStorage<Document>("load");

    const result = await loadEditorRuntimePersistence(runtime, storage, {
      fallback: { body: "Fallback", title: "Fallback" },
      onError,
      onEvent,
    });

    expect(result.runtime.document).toEqual({ body: "Fallback", title: "Fallback" });
    expect(result.runtime.status).toBe("clean");
    expect(result.persistence.status).toBe("error");
    expect(result.persistence.operation).toBe("load");
    expect(result.persistence.error).toBeInstanceOf(Error);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), { operation: "load" });
    expect(onEvent).toHaveBeenCalledWith({ revision: runtime.revision, type: "load-start" });
    expect(onEvent).toHaveBeenCalledWith({
      error: expect.any(Error),
      type: "load-error",
    });
  });

  test("skips save when runtime is clean", async () => {
    const onEvent = vi.fn();
    const runtime = createRuntime();
    const storage = createMemoryStorage<Document>(null);

    const result = await saveEditorRuntimePersistence(runtime, storage, { now: clock, onEvent });

    expect(result.saved).toBe(false);
    expect(result.runtime).toBe(runtime);
    expect(result.persistence.status).toBe("idle");
    expect(await storage.load()).toBeNull();
    expect(onEvent).toHaveBeenCalledWith({
      reason: "clean",
      revision: runtime.revision,
      type: "save-skipped",
    });
  });

  test("saves dirty runtime, marks it clean, and records revision and time", async () => {
    const onEvent = vi.fn();
    const runtime = commitEditorRuntime(createRuntime(), { body: "Saved", title: "Saved" });
    const storage = createMemoryStorage<Document>(null);

    const result = await saveEditorRuntimePersistence(runtime, storage, { now: clock, onEvent });

    expect(result.saved).toBe(true);
    expect(result.revision).toBe(runtime.revision);
    expect(result.runtime.status).toBe("clean");
    expect(result.runtime.savedRevision).toBe(runtime.revision);
    expect(await storage.load()).toEqual({ body: "Saved", title: "Saved" });
    expect(result.persistence).toMatchObject({
      error: null,
      operation: "save",
      savedAt: "2026-06-06T12:00:00.000Z",
      savedRevision: runtime.revision,
      status: "saved",
    });
    expect(onEvent).toHaveBeenCalledWith({ revision: runtime.revision, type: "save-start" });
    expect(onEvent).toHaveBeenCalledWith({
      revision: runtime.revision,
      savedAt: "2026-06-06T12:00:00.000Z",
      type: "save-success",
    });
  });

  test("force saves when runtime is clean", async () => {
    const runtime = createRuntime();
    const storage = createMemoryStorage<Document>(null);

    const result = await saveEditorRuntimePersistence(runtime, storage, {
      force: true,
      now: clock,
    });

    expect(result.saved).toBe(true);
    expect(result.runtime.status).toBe("clean");
    expect(await storage.load()).toEqual({ body: "Hello", title: "Draft" });
  });

  test("save failure leaves runtime dirty and exposes error state", async () => {
    const onError = vi.fn();
    const onEvent = vi.fn();
    const runtime = commitEditorRuntime(createRuntime(), { body: "Dirty", title: "Dirty" });
    const storage = createThrowingStorage<Document>("save");

    const result = await saveEditorRuntimePersistence(runtime, storage, { onError, onEvent });

    expect(result.saved).toBe(false);
    expect(result.runtime).toBe(runtime);
    expect(result.runtime.status).toBe("dirty");
    expect(result.persistence.status).toBe("error");
    expect(result.persistence.operation).toBe("save");
    expect(result.persistence.error).toBeInstanceOf(Error);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), {
      operation: "save",
      revision: runtime.revision,
    });
    expect(onEvent).toHaveBeenCalledWith({ revision: runtime.revision, type: "save-start" });
    expect(onEvent).toHaveBeenCalledWith({
      error: expect.any(Error),
      revision: runtime.revision,
      type: "save-error",
    });
  });

  test("loads conflict-aware persisted documents with revision tokens", async () => {
    const onEvent = vi.fn();
    const runtime = commitEditorRuntime(createRuntime(), { body: "Dirty", title: "Dirty" });
    const storage = createConflictMemoryStorage<Document>({
      document: { body: "Stored", title: "Stored" },
      revisionToken: "server-1",
    });

    const result = await loadEditorRuntimeConflictPersistence(runtime, storage, {
      now: clock,
      onEvent,
    });

    expect(result.runtime.document).toEqual({ body: "Stored", title: "Stored" });
    expect(result.runtime.status).toBe("clean");
    expect(result.persistence).toMatchObject({
      revisionToken: "server-1",
      status: "loaded",
    });
    expect(onEvent).toHaveBeenCalledWith({
      revisionToken: "server-1",
      type: "revision-token-updated",
    });
  });

  test("saves conflict-aware documents and updates revision tokens", async () => {
    const onEvent = vi.fn();
    const runtime = commitEditorRuntime(createRuntime(), { body: "Saved", title: "Saved" });
    const storage = createConflictMemoryStorage<Document>(null);
    storage.save = vi.fn((value) => {
      storage.value = { document: value.document, revisionToken: "server-2" };
      return storage.value;
    });

    const result = await saveEditorRuntimeConflictPersistence(runtime, storage, {
      now: clock,
      onEvent,
      revisionToken: "server-1",
    });

    expect(storage.save).toHaveBeenCalledWith({
      document: { body: "Saved", title: "Saved" },
      revisionToken: "server-1",
    });
    expect(result.saved).toBe(true);
    expect(result.runtime.status).toBe("clean");
    expect(result.persistence.revisionToken).toBe("server-2");
    expect(onEvent).toHaveBeenCalledWith({
      revisionToken: "server-2",
      type: "revision-token-updated",
    });
  });

  test("keeps runtime dirty and exposes conflict state on stale saves", async () => {
    const onError = vi.fn();
    const onEvent = vi.fn();
    const runtime = commitEditorRuntime(createRuntime(), { body: "Local", title: "Local" });
    const conflict = new EditorPersistenceConflictError("stale revision", {
      local: { document: runtime.document, revisionToken: "server-1" },
      remote: {
        document: { body: "Remote", title: "Remote" },
        revisionToken: "server-2",
      },
    });
    const storage = createConflictMemoryStorage<Document>(null);
    storage.save = vi.fn(() => {
      throw conflict;
    });

    const result = await saveEditorRuntimeConflictPersistence(runtime, storage, {
      onError,
      onEvent,
      revisionToken: "server-1",
    });

    expect(result.saved).toBe(false);
    expect(result.runtime).toBe(runtime);
    expect(result.runtime.status).toBe("dirty");
    expect(result.persistence.conflict).toBe(conflict);
    expect(result.persistence.error).toBe(conflict);
    expect(result.persistence.revisionToken).toBe("server-1");
    expect(onError).toHaveBeenCalledWith(conflict, {
      operation: "save",
      revision: runtime.revision,
    });
    expect(onEvent).toHaveBeenCalledWith({
      error: conflict,
      revision: runtime.revision,
      type: "save-conflict",
    });
  });

  test("clears only conflict-owned errors", () => {
    const conflict = new EditorPersistenceConflictError("stale revision", {
      local: { document: { body: "Local", title: "Local" }, revisionToken: "server-1" },
    });
    const otherError = new Error("network failed");
    const basePersistence = createEditorPersistenceState();

    expect(
      clearEditorPersistenceConflict({
        ...basePersistence,
        conflict,
        error: conflict,
        status: "error",
      }),
    ).toMatchObject({
      conflict: null,
      error: null,
      status: "error",
    });
    expect(
      clearEditorPersistenceConflict({
        ...basePersistence,
        conflict,
        error: otherError,
        status: "error",
      }),
    ).toMatchObject({
      conflict: null,
      error: otherError,
      status: "error",
    });
  });
});

function createRuntime(): EditorRuntimeState<Document, string> {
  return createEditorRuntime<Document, string>({
    history: {
      equals(left, right) {
        return left.body === right.body && left.title === right.title;
      },
    },
    initialDocument: { body: "Hello", title: "Draft" },
  });
}

function createMemoryStorage<TValue>(initialValue: TValue | null): EditorStorageAdapter<TValue> {
  let value = initialValue;

  return {
    load() {
      return value;
    },
    save(nextValue) {
      value = nextValue;
    },
  };
}

function createThrowingStorage<TValue>(operation: "load" | "save"): EditorStorageAdapter<TValue> {
  return {
    load() {
      if (operation === "load") {
        throw new Error("load failed");
      }
      return null;
    },
    save() {
      if (operation === "save") {
        throw new Error("save failed");
      }
    },
  };
}

type ConflictMemoryStorage<TValue> = EditorConflictStorageAdapter<TValue> & {
  value: EditorPersistedDocument<TValue> | null;
  load: ReturnType<typeof vi.fn<() => EditorPersistedDocument<TValue> | null>>;
  save: ReturnType<
    typeof vi.fn<(value: EditorPersistedDocument<TValue>) => EditorPersistedDocument<TValue>>
  >;
};

function createConflictMemoryStorage<TValue>(
  initialValue: EditorPersistedDocument<TValue> | null,
): ConflictMemoryStorage<TValue> {
  const storage = {
    value: initialValue,
  } as ConflictMemoryStorage<TValue>;

  storage.load = vi.fn(() => storage.value);
  storage.save = vi.fn((value: EditorPersistedDocument<TValue>) => {
    storage.value = value;
    return value;
  });

  return storage;
}
