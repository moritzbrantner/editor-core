import { describe, expect, test } from "vitest";
import { commitEditorRuntime } from "../runtime.js";
import { EditorPersistenceConflictError } from "./conflict.js";
import { createEditorRuntimeConflictPersistenceController } from "./controller.js";
import { createEditorPersistenceState } from "./state.js";
import {
  createConflictMemoryStorage,
  createRuntime,
  resolveUpdater,
  type TestDocument,
} from "./test-support.js";
import type { EditorPersistenceState } from "./types.js";

describe("editor runtime conflict persistence controller", () => {
  test("conflict controller loads and saves with revision tokens", async () => {
    let runtime = createRuntime();
    let persistence = createEditorPersistenceState();
    const storage = createConflictMemoryStorage<TestDocument>({
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
    const storage = createConflictMemoryStorage<TestDocument>(null);
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
