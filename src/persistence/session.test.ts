import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createEditorSession,
  createMemoryEditorSessionStorage,
  createMemoryEditorSessionJournal,
  EditorSessionConflictError,
  EditorSessionError,
  type EditorSessionDocumentAdapter,
} from "../persistence.js";
import { EditorJsonParseError, EditorMigrationError } from "../serialization.js";

type Document = { title: string };

const documentAdapter: EditorSessionDocumentAdapter<Document, unknown> = {
  parse(input) {
    if (
      !input ||
      typeof input !== "object" ||
      typeof (input as { title?: unknown }).title !== "string"
    ) {
      throw new Error("Expected title.");
    }
    return { title: (input as { title: string }).title };
  },
  serialize(document) {
    return document;
  },
};

describe("editor session", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("debounces, cancels, and flushes autosave through explicit lifecycle states", async () => {
    vi.useFakeTimers();
    const storage = createMemoryEditorSessionStorage<unknown>();
    const session = createEditorSession({
      autosave: { delayMs: 50 },
      document: documentAdapter,
      equals: (left, right) => left.title === right.title,
      initialDocument: { title: "Draft" },
      storage,
    });
    const statuses: string[] = [];
    const unsubscribe = session.subscribe(() => statuses.push(session.getState().status));

    expect(session.getState()).toMatchObject({
      document: { title: "Draft" },
      lastKnownGood: null,
      revisionToken: null,
      status: "idle",
    });

    await session.updateDocument({ title: "First" });
    expect(session.getState().status).toBe("dirty");
    session.cancelAutosave();
    await vi.advanceTimersByTimeAsync(50);
    expect(await storage.load()).toBeNull();

    await session.updateDocument({ title: "Second" });
    const saved = session.flush();
    await vi.runAllTimersAsync();
    await expect(saved).resolves.toBe(true);
    expect(session.getState()).toMatchObject({
      document: { title: "Second" },
      lastKnownGood: { document: { title: "Second" }, revisionToken: "1" },
      revisionToken: "1",
      status: "saved",
    });
    expect(statuses).toEqual(["dirty", "dirty", "saving", "saved"]);

    unsubscribe();
    await session.dispose();
  });

  test("rejects stale writes while preserving the dirty document and last-known-good snapshot", async () => {
    const storage = createMemoryEditorSessionStorage<unknown>({
      payload: { title: "Stored" },
      revisionToken: "1",
    });
    const first = createSession(storage);
    const second = createSession(storage);
    await first.load();
    await second.load();

    await first.updateDocument({ title: "First tab" });
    await expect(first.save()).resolves.toBe(true);

    await second.updateDocument({ title: "Second tab" });
    await expect(second.save()).resolves.toBe(false);
    const state = second.getState();
    expect(state).toMatchObject({
      document: { title: "Second tab" },
      lastKnownGood: { document: { title: "Stored" }, revisionToken: "1" },
      revisionToken: "1",
      status: "conflicted",
    });
    expect(state.status === "conflicted" ? state.error : null).toBeInstanceOf(
      EditorSessionConflictError,
    );

    await first.dispose();
    await second.dispose();
  });

  test("exposes unmigratable stored payloads for export and recovery", async () => {
    const corruptPayload = { schemaVersion: 0, title: "Legacy" };
    const storage = createMemoryEditorSessionStorage<unknown>({
      payload: corruptPayload,
      revisionToken: "4",
    });
    const session = createEditorSession({
      autosave: false,
      document: {
        ...documentAdapter,
        parse() {
          throw new EditorMigrationError("No migration from schema version 0.");
        },
      },
      equals: (left: Document, right: Document) => left.title === right.title,
      initialDocument: { title: "Fallback" },
      storage,
    });

    await expect(session.load()).resolves.toBe(false);
    expect(session.getState()).toMatchObject({
      document: { title: "Fallback" },
      error: { code: "migration", operation: "load" },
      recoveryPayload: corruptPayload,
      revisionToken: "4",
      status: "recoverable",
    });
    expect(session.exportRecoveryPayload()).toBe(corruptPayload);

    await session.recover({ title: "Recovered" });
    expect(session.getState()).toMatchObject({
      document: { title: "Recovered" },
      revisionToken: "4",
      status: "dirty",
    });
    await session.dispose();
  });

  test("restores unsaved work from an optional journal after interruption", async () => {
    const storage = createMemoryEditorSessionStorage<unknown>({
      payload: { title: "Stored" },
      revisionToken: "1",
    });
    const journal = createMemoryEditorSessionJournal<Document>();
    const interrupted = createEditorSession({
      autosave: false,
      document: documentAdapter,
      equals: (left, right) => left.title === right.title,
      initialDocument: { title: "Initial" },
      journal,
      storage,
    });
    await interrupted.load();
    await interrupted.updateDocument({ title: "Unsaved" });
    await interrupted.dispose();

    const restored = createEditorSession({
      autosave: false,
      document: documentAdapter,
      equals: (left, right) => left.title === right.title,
      initialDocument: { title: "Initial" },
      journal,
      storage,
    });
    await restored.load();
    expect(restored.getState()).toMatchObject({
      document: { title: "Unsaved" },
      error: { code: "recovery", operation: "journal" },
      lastKnownGood: { document: { title: "Stored" }, revisionToken: "1" },
      recoveryPayload: { title: "Unsaved" },
      status: "recoverable",
    });

    await restored.recover({ title: "Unsaved" });
    await expect(restored.save()).resolves.toBe(true);
    expect(await journal.load()).toBeNull();
    await restored.dispose();
  });

  test("classifies validation and serialization failures with typed diagnostics", async () => {
    const invalidStorage = createMemoryEditorSessionStorage<unknown>({
      payload: { title: 42 },
      revisionToken: "1",
    });
    const invalid = createEditorSession({
      autosave: false,
      document: {
        ...documentAdapter,
        parse() {
          throw new EditorJsonParseError([{ message: "Expected string.", path: "title" }]);
        },
      },
      equals: (left: Document, right: Document) => left.title === right.title,
      initialDocument: { title: "Fallback" },
      storage: invalidStorage,
    });
    await invalid.load();
    expect(invalid.getState()).toMatchObject({
      error: { code: "validation", operation: "load" },
      status: "recoverable",
    });

    const unserializable = createEditorSession({
      autosave: false,
      document: {
        ...documentAdapter,
        serialize() {
          throw new TypeError("Cannot serialize document.");
        },
      },
      equals: (left: Document, right: Document) => left.title === right.title,
      initialDocument: { title: "Draft" },
      storage: createMemoryEditorSessionStorage(),
    });
    await unserializable.updateDocument({ title: "Dirty" });
    await expect(unserializable.save()).resolves.toBe(false);
    expect(unserializable.getState()).toMatchObject({
      document: { title: "Dirty" },
      error: { code: "serialization", operation: "save" },
      status: "failed",
    });

    await invalid.dispose();
    await unserializable.dispose();
  });

  test("failed saves retain the dirty document and last-known-good snapshot", async () => {
    const memory = createMemoryEditorSessionStorage<unknown>({
      payload: { title: "Stored" },
      revisionToken: "1",
    });
    let fail = true;
    const session = createEditorSession({
      autosave: false,
      document: documentAdapter,
      equals: (left: Document, right: Document) => left.title === right.title,
      initialDocument: { title: "Initial" },
      storage: {
        load: memory.load,
        async save(value) {
          if (fail) {
            throw new EditorSessionError("Storage quota exceeded.", {
              code: "quota",
              operation: "save",
            });
          }
          return memory.save(value);
        },
      },
    });
    await session.load();
    await session.updateDocument({ title: "Dirty" });

    await expect(session.save()).resolves.toBe(false);
    expect(session.getState()).toMatchObject({
      document: { title: "Dirty" },
      error: { code: "quota" },
      lastKnownGood: { document: { title: "Stored" }, revisionToken: "1" },
      status: "failed",
    });

    fail = false;
    await expect(session.save()).resolves.toBe(true);
    expect(session.getState().status).toBe("saved");
    await session.dispose();
  });
});

function createSession(storage: ReturnType<typeof createMemoryEditorSessionStorage<unknown>>) {
  return createEditorSession({
    autosave: false,
    document: documentAdapter,
    equals: (left: Document, right: Document) => left.title === right.title,
    initialDocument: { title: "Initial" },
    storage,
  });
}
