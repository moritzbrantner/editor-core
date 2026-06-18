import { describe, expect, test, vi } from "vitest";
import { commitEditorRuntime } from "../runtime.js";
import { createEditorRuntimePersistenceController } from "./controller.js";
import { createEditorPersistenceState } from "./state.js";
import {
  createDeferred,
  createRuntime,
  createTestScheduler,
  createTrackedMemoryStorage,
  flushPromises,
  resolveUpdater,
  type TestDocument,
} from "./test-support.js";

describe("editor runtime persistence controller autosave", () => {
  test("controller debounces autosave for dirty runtime revisions", async () => {
    let runtime = commitEditorRuntime(createRuntime(), { body: "Dirty", title: "Dirty" });
    let persistence = createEditorPersistenceState();
    const scheduler = createTestScheduler();
    const storage = createTrackedMemoryStorage<TestDocument>(null);
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
    const storage = createTrackedMemoryStorage<TestDocument>(null);
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
    const storage = createTrackedMemoryStorage<TestDocument>(null);
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

  test("controller retries failed autosaves for the same revision", async () => {
    let runtime = commitEditorRuntime(createRuntime(), { body: "Retry", title: "Retry" });
    let persistence = createEditorPersistenceState();
    const scheduler = createTestScheduler();
    const storage = createTrackedMemoryStorage<TestDocument>(null);
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
    const storage = createTrackedMemoryStorage<TestDocument>(null);
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
    const storage = createTrackedMemoryStorage<TestDocument>(null);
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
});
