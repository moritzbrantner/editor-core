import { expect, test } from "vitest";
import {
  createEditorSession,
  createMemoryEditorSessionJournal,
  createMemoryEditorSessionStorage,
} from "../persistence.js";

type Document = { title: string };

test("an older in-flight save does not clear a newer journaled document", async () => {
  const saveStarted = createDeferred<void>();
  const releaseSave = createDeferred<void>();
  const memory = createMemoryEditorSessionStorage<unknown>();
  const journal = createMemoryEditorSessionJournal<Document>();
  const session = createEditorSession({
    autosave: false,
    document: {
      parse(input) {
        if (!input || typeof input !== "object" || !("title" in input)) {
          throw new Error("Expected document.");
        }
        const title = input.title;
        if (typeof title !== "string") {
          throw new Error("Expected title.");
        }
        return { title };
      },
      serialize(document) {
        return document;
      },
    },
    equals: (left, right) => left.title === right.title,
    initialDocument: { title: "Initial" },
    journal,
    storage: {
      load: memory.load,
      async save(value) {
        saveStarted.resolve();
        await releaseSave.promise;
        return memory.save(value);
      },
    },
  });

  await session.updateDocument({ title: "First" });
  const saving = session.save();
  await saveStarted.promise;
  await session.updateDocument({ title: "Second" });
  releaseSave.resolve();
  await expect(saving).resolves.toBe(true);

  expect(session.getState()).toMatchObject({
    document: { title: "Second" },
    lastKnownGood: { document: { title: "First" } },
    status: "dirty",
  });
  expect(await journal.load()).toEqual({ title: "Second" });
  await session.dispose();
});

test("concurrent direct saves share one owned storage write", async () => {
  const releaseSave = createDeferred<void>();
  const memory = createMemoryEditorSessionStorage<unknown>();
  let saveCount = 0;
  const session = createEditorSession({
    autosave: false,
    document: {
      parse: () => ({ title: "Stored" }),
      serialize: (document: Document) => document,
    },
    equals: (left, right) => left.title === right.title,
    initialDocument: { title: "Initial" },
    storage: {
      load: memory.load,
      async save(value) {
        saveCount += 1;
        await releaseSave.promise;
        return memory.save(value);
      },
    },
  });
  await session.updateDocument({ title: "Dirty" });

  const first = session.save();
  const second = session.save();
  await Promise.resolve();
  expect(saveCount).toBe(1);
  releaseSave.resolve();
  await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  expect(saveCount).toBe(1);
  await session.dispose();
});

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
