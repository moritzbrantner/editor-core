import { describe, expect, test, vi } from "vitest";
import type { EditorStorageAdapter } from "./browser.js";
import { commitEditorRuntime, createEditorRuntime, type EditorRuntimeState } from "./runtime.js";
import { emitRevisionTokenUpdated } from "./persistence/events.js";
import {
  createLoadedPersistenceState,
  createLoadErrorPersistenceState,
  createSavedPersistenceState,
  createSaveErrorPersistenceState,
  createSkippedSavePersistenceState,
} from "./persistence/state.js";
import {
  EditorPersistenceConflictError,
  clearEditorPersistenceConflict,
  createEditorPersistenceState,
  createEditorRuntimeConflictPersistenceController,
  createEditorRuntimePersistenceController,
  loadEditorRuntimeConflictPersistence,
  loadEditorRuntimePersistence,
  saveEditorRuntimeConflictPersistence,
  saveEditorRuntimePersistence,
  type EditorConflictStorageAdapter,
  type EditorPersistedDocument,
  type EditorPersistenceScheduler,
  type EditorPersistenceState,
} from "./persistence.js";

type Document = {
  body: string;
  title: string;
};

const clock = () => "2026-06-06T12:00:00.000Z";

describe("editor persistence", () => {
  test("creates default idle persistence state", () => {
    expect(createEditorPersistenceState()).toEqual({
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

  test("creates explicit persistence state snapshots", () => {
    const error = new Error("load failed");
    const conflict = new EditorPersistenceConflictError("stale revision", {
      local: { document: { body: "Local", title: "Local" }, revisionToken: "server-1" },
    });

    expect(
      createLoadedPersistenceState({
        revision: 3,
        revisionToken: "server-2",
        timestamp: "2026-06-06T12:00:00.000Z",
      }),
    ).toMatchObject({
      loadedAt: "2026-06-06T12:00:00.000Z",
      operation: "load",
      revisionToken: "server-2",
      savedAt: "2026-06-06T12:00:00.000Z",
      savedRevision: 3,
      status: "loaded",
    });
    expect(
      createLoadErrorPersistenceState({
        error,
        revision: 4,
        revisionToken: "server-3",
      }),
    ).toMatchObject({
      error,
      operation: "load",
      revisionToken: "server-3",
      savedRevision: 4,
      status: "error",
    });
    expect(
      createSkippedSavePersistenceState({
        revisionToken: "server-4",
        savedRevision: 5,
      }),
    ).toMatchObject({
      operation: null,
      revisionToken: "server-4",
      savedRevision: 5,
      status: "idle",
    });
    expect(
      createSavedPersistenceState({
        revision: 6,
        revisionToken: "server-5",
        timestamp: "2026-06-06T12:01:00.000Z",
      }),
    ).toMatchObject({
      operation: "save",
      revisionToken: "server-5",
      savedAt: "2026-06-06T12:01:00.000Z",
      savedRevision: 6,
      status: "saved",
    });
    expect(
      createSaveErrorPersistenceState({
        conflict,
        error: conflict,
        revisionToken: "server-6",
        savedRevision: 7,
      }),
    ).toMatchObject({
      conflict,
      error: conflict,
      operation: "save",
      revisionToken: "server-6",
      savedRevision: 7,
      status: "error",
    });
  });

  test("emits revision token updates only when enabled", () => {
    const onEvent = vi.fn();

    emitRevisionTokenUpdated({ onEvent }, "server-1", { emitRevisionToken: true });
    emitRevisionTokenUpdated({ onEvent }, "server-2", { emitRevisionToken: false });

    expect(onEvent).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith({
      revisionToken: "server-1",
      type: "revision-token-updated",
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

  test("controller saves dirty runtime through caller-owned state", async () => {
    let runtime = commitEditorRuntime(createRuntime(), { body: "Dirty", title: "Dirty" });
    let persistence = createEditorPersistenceState();
    const storage = createMemoryStorage<Document>(null);
    const controller = createEditorRuntimePersistenceController({
      getPersistence: () => persistence,
      getRuntime: () => runtime,
      setPersistence: (updater) => {
        persistence = resolveUpdater(persistence, updater);
      },
      setRuntime: (updater) => {
        runtime = resolveUpdater(runtime, updater);
      },
      storage,
    });

    const saved = await controller.save();

    expect(saved).toBe(true);
    expect(runtime.status).toBe("clean");
    expect(persistence.status).toBe("saved");
    expect(await storage.load()).toEqual({ body: "Dirty", title: "Dirty" });
  });

  test("controller loads stored documents and marks caller-owned runtime clean", async () => {
    let runtime = commitEditorRuntime(createRuntime(), { body: "Dirty", title: "Dirty" });
    let persistence = createEditorPersistenceState();
    const controller = createEditorRuntimePersistenceController({
      getPersistence: () => persistence,
      getRuntime: () => runtime,
      now: clock,
      setPersistence: (updater) => {
        persistence = resolveUpdater(persistence, updater);
      },
      setRuntime: (updater) => {
        runtime = resolveUpdater(runtime, updater);
      },
      storage: createMemoryStorage<Document>({ body: "Stored", title: "Stored" }),
    });

    await controller.load();

    expect(runtime.document).toEqual({ body: "Stored", title: "Stored" });
    expect(runtime.status).toBe("clean");
    expect(persistence.status).toBe("loaded");
    expect(persistence.loadedAt).toBe("2026-06-06T12:00:00.000Z");
  });

  test("controller skips clean saves without calling storage", async () => {
    let runtime = createRuntime();
    let persistence = createEditorPersistenceState();
    const onEvent = vi.fn();
    const storage = createTrackedMemoryStorage<Document>(null);
    const controller = createEditorRuntimePersistenceController({
      getPersistence: () => persistence,
      getRuntime: () => runtime,
      onEvent,
      setPersistence: (updater) => {
        persistence = resolveUpdater(persistence, updater);
      },
      setRuntime: (updater) => {
        runtime = resolveUpdater(runtime, updater);
      },
      storage,
    });

    const saved = await controller.save();

    expect(saved).toBe(false);
    expect(storage.save).not.toHaveBeenCalled();
    expect(persistence.status).toBe("idle");
    expect(onEvent).toHaveBeenCalledWith({
      reason: "clean",
      revision: runtime.revision,
      type: "save-skipped",
    });
  });

  test("controller debounces autosave for dirty runtime revisions", async () => {
    let runtime = commitEditorRuntime(createRuntime(), { body: "Dirty", title: "Dirty" });
    let persistence = createEditorPersistenceState();
    const scheduler = createTestScheduler();
    const storage = createTrackedMemoryStorage<Document>(null);
    const controller = createEditorRuntimePersistenceController({
      autosave: { delayMs: 25 },
      getPersistence: () => persistence,
      getRuntime: () => runtime,
      scheduler,
      setPersistence: (updater) => {
        persistence = resolveUpdater(persistence, updater);
      },
      setRuntime: (updater) => {
        runtime = resolveUpdater(runtime, updater);
      },
      storage,
    });

    controller.notifyRuntimeChanged();

    expect(scheduler.pendingDelays()).toEqual([25]);
    expect(storage.save).not.toHaveBeenCalled();

    await scheduler.runNext();

    expect(storage.save).toHaveBeenCalledWith({ body: "Dirty", title: "Dirty" });
    expect(runtime.status).toBe("clean");
    expect(persistence.status).toBe("saved");
  });

  test("controller saves the latest dirty revision after a stale in-flight save finishes", async () => {
    let runtime = commitEditorRuntime(createRuntime(), { body: "First", title: "First" });
    let persistence = createEditorPersistenceState();
    const firstSave = createDeferred<void>();
    const onEvent = vi.fn();
    const scheduler = createTestScheduler();
    const storage = createTrackedMemoryStorage<Document>(null);
    storage.save.mockImplementationOnce(async (value) => {
      storage.value = value;
      await firstSave.promise;
    });
    const controller = createEditorRuntimePersistenceController({
      autosave: { delayMs: 0 },
      getPersistence: () => persistence,
      getRuntime: () => runtime,
      onEvent,
      scheduler,
      setPersistence: (updater) => {
        persistence = resolveUpdater(persistence, updater);
      },
      setRuntime: (updater) => {
        runtime = resolveUpdater(runtime, updater);
      },
      storage,
    });

    controller.notifyRuntimeChanged();
    await scheduler.runNext();
    expect(persistence.status).toBe("saving");

    runtime = commitEditorRuntime(runtime, { body: "Second", title: "Second" });
    controller.notifyRuntimeChanged();
    expect(onEvent).toHaveBeenCalledWith({
      reason: "in-flight",
      revision: runtime.revision,
      type: "save-skipped",
    });

    firstSave.resolve();
    await firstSave.promise;
    await flushPromises();

    expect(runtime.document).toEqual({ body: "Second", title: "Second" });
    expect(runtime.status).toBe("dirty");
    expect(scheduler.pendingDelays()).toEqual([0]);

    await scheduler.runNext();

    expect(storage.save).toHaveBeenCalledTimes(2);
    expect(storage.save).toHaveBeenLastCalledWith({ body: "Second", title: "Second" });
    expect(runtime.status).toBe("clean");
  });

  test("controller does not schedule a latest save when saveLatest is false", async () => {
    let runtime = commitEditorRuntime(createRuntime(), { body: "First", title: "First" });
    let persistence = createEditorPersistenceState();
    const firstSave = createDeferred<void>();
    const scheduler = createTestScheduler();
    const storage = createTrackedMemoryStorage<Document>(null);
    storage.save.mockImplementationOnce(async (value) => {
      storage.value = value;
      await firstSave.promise;
    });
    const controller = createEditorRuntimePersistenceController({
      autosave: { delayMs: 0, saveLatest: false },
      getPersistence: () => persistence,
      getRuntime: () => runtime,
      scheduler,
      setPersistence: (updater) => {
        persistence = resolveUpdater(persistence, updater);
      },
      setRuntime: (updater) => {
        runtime = resolveUpdater(runtime, updater);
      },
      storage,
    });

    controller.notifyRuntimeChanged();
    await scheduler.runNext();
    runtime = commitEditorRuntime(runtime, { body: "Second", title: "Second" });
    controller.notifyRuntimeChanged();
    firstSave.resolve();
    await firstSave.promise;
    await flushPromises();

    expect(storage.save).toHaveBeenCalledOnce();
    expect(runtime.status).toBe("dirty");
    expect(scheduler.pendingDelays()).toEqual([]);
  });

  test("controller skips blocked saves", async () => {
    let runtime = commitEditorRuntime(createRuntime(), { body: "Dirty", title: "Dirty" });
    let persistence = createEditorPersistenceState();
    const onEvent = vi.fn();
    const storage = createTrackedMemoryStorage<Document>(null);
    const controller = createEditorRuntimePersistenceController({
      canSave: () => false,
      getPersistence: () => persistence,
      getRuntime: () => runtime,
      onEvent,
      setPersistence: (updater) => {
        persistence = resolveUpdater(persistence, updater);
      },
      setRuntime: (updater) => {
        runtime = resolveUpdater(runtime, updater);
      },
      storage,
    });

    await expect(controller.save()).resolves.toBe(false);

    expect(storage.save).not.toHaveBeenCalled();
    expect(persistence.status).toBe("idle");
    expect(onEvent).toHaveBeenCalledWith({
      reason: "blocked",
      revision: runtime.revision,
      type: "save-skipped",
    });
  });

  test("controller retries failed autosaves for the same revision", async () => {
    let runtime = commitEditorRuntime(createRuntime(), { body: "Retry", title: "Retry" });
    let persistence = createEditorPersistenceState();
    const scheduler = createTestScheduler();
    const storage = createTrackedMemoryStorage<Document>(null);
    storage.save.mockRejectedValueOnce(new Error("save failed")).mockImplementationOnce((value) => {
      storage.value = value;
    });
    const controller = createEditorRuntimePersistenceController({
      autosave: { delayMs: 0, retry: { attempts: 1, delayMs: 10 } },
      getPersistence: () => persistence,
      getRuntime: () => runtime,
      scheduler,
      setPersistence: (updater) => {
        persistence = resolveUpdater(persistence, updater);
      },
      setRuntime: (updater) => {
        runtime = resolveUpdater(runtime, updater);
      },
      storage,
    });

    controller.notifyRuntimeChanged();
    await scheduler.runNext();

    expect(storage.save).toHaveBeenCalledOnce();
    expect(persistence.status).toBe("error");
    expect(scheduler.pendingDelays()).toEqual([10]);

    await scheduler.runNext();

    expect(storage.save).toHaveBeenCalledTimes(2);
    expect(runtime.status).toBe("clean");
    expect(persistence.status).toBe("saved");
  });

  test("controller dispose clears pending autosave work", async () => {
    let runtime = commitEditorRuntime(createRuntime(), { body: "Dirty", title: "Dirty" });
    let persistence = createEditorPersistenceState();
    const scheduler = createTestScheduler();
    const storage = createTrackedMemoryStorage<Document>(null);
    const controller = createEditorRuntimePersistenceController({
      autosave: { delayMs: 25 },
      getPersistence: () => persistence,
      getRuntime: () => runtime,
      scheduler,
      setPersistence: (updater) => {
        persistence = resolveUpdater(persistence, updater);
      },
      setRuntime: (updater) => {
        runtime = resolveUpdater(runtime, updater);
      },
      storage,
    });

    controller.notifyRuntimeChanged();
    controller.dispose();
    await scheduler.runAll();

    expect(storage.save).not.toHaveBeenCalled();
    expect(runtime.status).toBe("dirty");
    expect(persistence.status).toBe("idle");
  });

  test("controller dispose prevents retry continuation saves", async () => {
    let runtime = commitEditorRuntime(createRuntime(), { body: "Retry", title: "Retry" });
    let persistence = createEditorPersistenceState();
    const scheduler = createTestScheduler();
    const storage = createTrackedMemoryStorage<Document>(null);
    storage.save.mockRejectedValueOnce(new Error("save failed")).mockImplementationOnce((value) => {
      storage.value = value;
    });
    const controller = createEditorRuntimePersistenceController({
      autosave: { delayMs: 0, retry: { attempts: 1, delayMs: 10 } },
      getPersistence: () => persistence,
      getRuntime: () => runtime,
      scheduler,
      setPersistence: (updater) => {
        persistence = resolveUpdater(persistence, updater);
      },
      setRuntime: (updater) => {
        runtime = resolveUpdater(runtime, updater);
      },
      storage,
    });

    controller.notifyRuntimeChanged();
    await scheduler.runNext();

    expect(storage.save).toHaveBeenCalledOnce();
    expect(persistence.status).toBe("error");
    expect(scheduler.pendingDelays()).toEqual([10]);

    controller.dispose();
    await scheduler.runAll();
    await flushPromises();

    expect(storage.save).toHaveBeenCalledOnce();
    expect(runtime.status).toBe("dirty");
    expect(persistence.status).toBe("error");
  });

  test("controller save is a no-op after dispose", async () => {
    let runtime = commitEditorRuntime(createRuntime(), { body: "Dirty", title: "Dirty" });
    let persistence = createEditorPersistenceState();
    const storage = createTrackedMemoryStorage<Document>(null);
    const controller = createEditorRuntimePersistenceController({
      getPersistence: () => persistence,
      getRuntime: () => runtime,
      setPersistence: (updater) => {
        persistence = resolveUpdater(persistence, updater);
      },
      setRuntime: (updater) => {
        runtime = resolveUpdater(runtime, updater);
      },
      storage,
    });

    controller.dispose();
    const saved = await controller.save();

    expect(saved).toBe(false);
    expect(storage.save).not.toHaveBeenCalled();
    expect(runtime.status).toBe("dirty");
    expect(persistence.status).toBe("idle");
  });

  test("controller load is a no-op after dispose", async () => {
    let runtime = commitEditorRuntime(createRuntime(), { body: "Dirty", title: "Dirty" });
    let persistence = createEditorPersistenceState();
    const storage = createTrackedMemoryStorage<Document>({ body: "Stored", title: "Stored" });
    const controller = createEditorRuntimePersistenceController({
      getPersistence: () => persistence,
      getRuntime: () => runtime,
      setPersistence: (updater) => {
        persistence = resolveUpdater(persistence, updater);
      },
      setRuntime: (updater) => {
        runtime = resolveUpdater(runtime, updater);
      },
      storage,
    });

    controller.dispose();
    await controller.load();

    expect(storage.load).not.toHaveBeenCalled();
    expect(runtime.document).toEqual({ body: "Dirty", title: "Dirty" });
    expect(runtime.status).toBe("dirty");
    expect(persistence.status).toBe("idle");
  });

  test("controller skips load while save is in flight", async () => {
    let runtime = commitEditorRuntime(createRuntime(), { body: "Dirty", title: "Dirty" });
    let persistence = createEditorPersistenceState();
    const firstSave = createDeferred<void>();
    const storage = createTrackedMemoryStorage<Document>({ body: "Stored", title: "Stored" });
    storage.save.mockImplementationOnce(async (value) => {
      storage.value = value;
      await firstSave.promise;
    });
    const controller = createEditorRuntimePersistenceController({
      getPersistence: () => persistence,
      getRuntime: () => runtime,
      setPersistence: (updater) => {
        persistence = resolveUpdater(persistence, updater);
      },
      setRuntime: (updater) => {
        runtime = resolveUpdater(runtime, updater);
      },
      storage,
    });

    const savePromise = controller.save();
    await flushPromises();
    await controller.load();

    expect(storage.load).not.toHaveBeenCalled();
    expect(persistence.status).toBe("saving");

    firstSave.resolve();
    await savePromise;

    expect(runtime.status).toBe("clean");
    expect(persistence.status).toBe("saved");
  });

  test("conflict controller loads and saves with revision tokens", async () => {
    let runtime = createRuntime();
    let persistence = createEditorPersistenceState();
    const storage = createConflictMemoryStorage<Document>({
      document: { body: "Stored", title: "Stored" },
      revisionToken: "server-1",
    });
    storage.save.mockImplementationOnce((value) => {
      storage.value = { document: value.document, revisionToken: "server-2" };
      return storage.value;
    });
    const controller = createEditorRuntimeConflictPersistenceController({
      getPersistence: () => persistence,
      getRuntime: () => runtime,
      setPersistence: (updater) => {
        persistence = resolveUpdater(persistence, updater);
      },
      setRuntime: (updater) => {
        runtime = resolveUpdater(runtime, updater);
      },
      storage,
    });

    await controller.load();
    runtime = commitEditorRuntime(runtime, { body: "Saved", title: "Saved" });
    await controller.save();

    expect(storage.save).toHaveBeenCalledWith({
      document: { body: "Saved", title: "Saved" },
      revisionToken: "server-1",
    });
    expect(persistence.revisionToken).toBe("server-2");
    expect(runtime.status).toBe("clean");
  });

  test("conflict controller keeps runtime dirty and exposes stale save conflicts", async () => {
    let runtime = commitEditorRuntime(createRuntime(), { body: "Local", title: "Local" });
    let persistence: EditorPersistenceState = {
      ...createEditorPersistenceState(),
      revisionToken: "server-1",
    };
    const conflict = new EditorPersistenceConflictError("stale revision", {
      local: { document: runtime.document, revisionToken: "server-1" },
      remote: {
        document: { body: "Remote", title: "Remote" },
        revisionToken: "server-2",
      },
    });
    const storage = createConflictMemoryStorage<Document>(null);
    storage.save.mockImplementationOnce(() => {
      throw conflict;
    });
    const controller = createEditorRuntimeConflictPersistenceController({
      getPersistence: () => persistence,
      getRuntime: () => runtime,
      setPersistence: (updater) => {
        persistence = resolveUpdater(persistence, updater);
      },
      setRuntime: (updater) => {
        runtime = resolveUpdater(runtime, updater);
      },
      storage,
    });

    await expect(controller.save()).resolves.toBe(false);

    expect(runtime.status).toBe("dirty");
    expect(persistence.conflict).toBe(conflict);
    expect(persistence.revisionToken).toBe("server-1");
  });
});

function resolveUpdater<T>(value: T, updater: T | ((current: T) => T)): T {
  return typeof updater === "function" ? (updater as (current: T) => T)(value) : updater;
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

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

type TrackedMemoryStorage<TValue> = EditorStorageAdapter<TValue> & {
  value: TValue | null;
  load: ReturnType<typeof vi.fn<() => TValue | null>>;
  save: ReturnType<typeof vi.fn<(value: TValue) => void | Promise<void>>>;
};

function createTrackedMemoryStorage<TValue>(
  initialValue: TValue | null,
): TrackedMemoryStorage<TValue> {
  const storage = {
    value: initialValue,
  } as TrackedMemoryStorage<TValue>;

  storage.load = vi.fn(() => storage.value);
  storage.save = vi.fn((value: TValue) => {
    storage.value = value;
  });

  return storage;
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

type Deferred<TValue> = {
  promise: Promise<TValue>;
  reject: (error: unknown) => void;
  resolve: (value: TValue | PromiseLike<TValue>) => void;
};

function createDeferred<TValue>(): Deferred<TValue> {
  let resolve: Deferred<TValue>["resolve"] | undefined;
  let reject: Deferred<TValue>["reject"] | undefined;
  const promise = new Promise<TValue>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    reject(error) {
      reject?.(error);
    },
    resolve(value) {
      resolve?.(value);
    },
  };
}

function createTestScheduler(): EditorPersistenceScheduler & {
  pendingDelays: () => number[];
  runAll: () => Promise<void>;
  runNext: () => Promise<void>;
} {
  type Task = {
    active: boolean;
    callback: () => void;
    delayMs: number;
    id: number;
  };
  const tasks: Task[] = [];
  let nextId = 1;

  const scheduler = {
    clearTimeout(timer: unknown) {
      const task = tasks.find((candidate) => candidate.id === timer);
      if (task) {
        task.active = false;
      }
    },
    pendingDelays() {
      return tasks.filter((task) => task.active).map((task) => task.delayMs);
    },
    async runAll() {
      while (tasks.some((task) => task.active)) {
        await scheduler.runNext();
      }
    },
    async runNext() {
      const task = tasks.find((candidate) => candidate.active);
      if (!task) {
        return;
      }
      task.active = false;
      task.callback();
      await flushPromises();
    },
    setTimeout(callback: () => void, delayMs: number) {
      const task = {
        active: true,
        callback,
        delayMs,
        id: nextId,
      };
      nextId += 1;
      tasks.push(task);
      return task.id;
    },
  };

  return scheduler;
}
