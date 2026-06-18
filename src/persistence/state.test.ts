import { describe, expect, test } from "vitest";
import { EditorPersistenceConflictError } from "./conflict.js";
import {
  clearEditorPersistenceConflict,
  createEditorPersistenceState,
  createLoadedPersistenceState,
  createLoadErrorPersistenceState,
  createSavedPersistenceState,
  createSaveErrorPersistenceState,
  createSkippedSavePersistenceState,
} from "./state.js";
import type { EditorPersistenceState } from "./types.js";

describe("editor persistence state", () => {
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
