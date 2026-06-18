import { describe, expect, test, vi } from "vitest";
import { commitEditorRuntime } from "../runtime.js";
import { loadEditorRuntimePersistence } from "./load.js";
import {
  clock,
  createMemoryStorage,
  createRuntime,
  createThrowingStorage,
  type TestDocument,
} from "./test-support.js";

describe("editor runtime persistence load", () => {
  test("loads persisted document and marks runtime clean", async () => {
    const onEvent = vi.fn();
    const runtime = commitEditorRuntime(createRuntime(), { body: "Dirty", title: "Dirty" });
    const storage = createMemoryStorage<TestDocument>({ body: "Stored", title: "Stored" });

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
    const storage = createMemoryStorage<TestDocument>(null);

    const result = await loadEditorRuntimePersistence(runtime, storage, { now: clock });

    expect(result.runtime.document).toEqual({ body: "Current", title: "Current" });
    expect(result.runtime.status).toBe("clean");
    expect(result.persistence.status).toBe("loaded");
  });

  test("handles load errors by exposing error state and using fallback document", async () => {
    const onError = vi.fn();
    const onEvent = vi.fn();
    const runtime = createRuntime();
    const storage = createThrowingStorage<TestDocument>("load");

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
});
