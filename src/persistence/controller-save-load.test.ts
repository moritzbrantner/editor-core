import { describe, expect, test, vi } from "vitest";
import { commitEditorRuntime } from "../runtime.js";
import { createEditorRuntimePersistenceController } from "./controller.js";
import { createEditorPersistenceState } from "./state.js";
import {
  clock,
  createDeferred,
  createMemoryStorage,
  createRuntime,
  createTrackedMemoryStorage,
  flushPromises,
  resolveUpdater,
  type TestDocument,
} from "./test-support.js";

describe("editor runtime persistence controller save/load", () => {
  test("controller saves dirty runtime through caller-owned state", async () => {
    let runtime = commitEditorRuntime(createRuntime(), { body: "Dirty", title: "Dirty" });
    let persistence = createEditorPersistenceState();
    const storage = createMemoryStorage<TestDocument>(null);
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
      storage: createMemoryStorage<TestDocument>({ body: "Stored", title: "Stored" }),
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
    const storage = createTrackedMemoryStorage<TestDocument>(null);
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

  test("controller skips blocked saves", async () => {
    let runtime = commitEditorRuntime(createRuntime(), { body: "Dirty", title: "Dirty" });
    let persistence = createEditorPersistenceState();
    const onEvent = vi.fn();
    const storage = createTrackedMemoryStorage<TestDocument>(null);
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

  test("controller save is a no-op after dispose", async () => {
    let runtime = commitEditorRuntime(createRuntime(), { body: "Dirty", title: "Dirty" });
    let persistence = createEditorPersistenceState();
    const storage = createTrackedMemoryStorage<TestDocument>(null);
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
    const storage = createTrackedMemoryStorage<TestDocument>({ body: "Stored", title: "Stored" });
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
    const storage = createTrackedMemoryStorage<TestDocument>({ body: "Stored", title: "Stored" });
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
});
