import { describe, expect, test, vi } from "vitest";
import type { EditorStorageAdapter } from "./browser.js";
import { commitEditorRuntime, createEditorRuntime, type EditorRuntimeState } from "./runtime.js";
import {
  createEditorPersistenceState,
  loadEditorRuntimePersistence,
  saveEditorRuntimePersistence,
} from "./persistence.js";

type Document = {
  body: string;
  title: string;
};

const clock = () => "2026-06-06T12:00:00.000Z";

describe("editor persistence", () => {
  test("creates default idle persistence state", () => {
    expect(createEditorPersistenceState({ now: clock })).toEqual({
      error: null,
      loadedAt: null,
      operation: null,
      savedAt: null,
      savedRevision: null,
      savingRevision: null,
      status: "idle",
    });
  });

  test("loads persisted document and marks runtime clean", async () => {
    const runtime = commitEditorRuntime(createRuntime(), { body: "Dirty", title: "Dirty" });
    const storage = createMemoryStorage<Document>({ body: "Stored", title: "Stored" });

    const result = await loadEditorRuntimePersistence(runtime, storage, {
      now: clock,
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
    const runtime = createRuntime();
    const storage = createThrowingStorage<Document>("load");

    const result = await loadEditorRuntimePersistence(runtime, storage, {
      fallback: { body: "Fallback", title: "Fallback" },
      onError,
    });

    expect(result.runtime.document).toEqual({ body: "Fallback", title: "Fallback" });
    expect(result.runtime.status).toBe("clean");
    expect(result.persistence.status).toBe("error");
    expect(result.persistence.operation).toBe("load");
    expect(result.persistence.error).toBeInstanceOf(Error);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), { operation: "load" });
  });

  test("skips save when runtime is clean", async () => {
    const runtime = createRuntime();
    const storage = createMemoryStorage<Document>(null);

    const result = await saveEditorRuntimePersistence(runtime, storage, { now: clock });

    expect(result.saved).toBe(false);
    expect(result.runtime).toBe(runtime);
    expect(result.persistence.status).toBe("idle");
    expect(await storage.load()).toBeNull();
  });

  test("saves dirty runtime, marks it clean, and records revision and time", async () => {
    const runtime = commitEditorRuntime(createRuntime(), { body: "Saved", title: "Saved" });
    const storage = createMemoryStorage<Document>(null);

    const result = await saveEditorRuntimePersistence(runtime, storage, { now: clock });

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
    const runtime = commitEditorRuntime(createRuntime(), { body: "Dirty", title: "Dirty" });
    const storage = createThrowingStorage<Document>("save");

    const result = await saveEditorRuntimePersistence(runtime, storage, { onError });

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
