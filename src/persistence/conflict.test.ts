import { describe, expect, test, vi } from "vitest";
import { commitEditorRuntime } from "../runtime.js";
import { EditorPersistenceConflictError } from "./conflict.js";
import { loadEditorRuntimeConflictPersistence } from "./load.js";
import { saveEditorRuntimeConflictPersistence } from "./save.js";
import {
  clock,
  createConflictMemoryStorage,
  createRuntime,
  type TestDocument,
} from "./test-support.js";

describe("editor runtime conflict persistence", () => {
  test("loads conflict-aware persisted documents with revision tokens", async () => {
    const onEvent = vi.fn();
    const runtime = commitEditorRuntime(createRuntime(), { body: "Dirty", title: "Dirty" });
    const storage = createConflictMemoryStorage<TestDocument>({
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
    const storage = createConflictMemoryStorage<TestDocument>(null);
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
    const storage = createConflictMemoryStorage<TestDocument>(null);
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
});
