import { describe, expect, test, vi } from "vitest";
import { commitEditorRuntime } from "../runtime.js";
import { saveEditorRuntimePersistence } from "./save.js";
import {
  clock,
  createMemoryStorage,
  createRuntime,
  createThrowingStorage,
  type TestDocument,
} from "./test-support.js";

describe("editor runtime persistence save", () => {
  test("skips save when runtime is clean", async () => {
    const onEvent = vi.fn();
    const runtime = createRuntime();
    const storage = createMemoryStorage<TestDocument>(null);

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
    const storage = createMemoryStorage<TestDocument>(null);

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
    const storage = createMemoryStorage<TestDocument>(null);

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
    const storage = createThrowingStorage<TestDocument>("save");

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
});
