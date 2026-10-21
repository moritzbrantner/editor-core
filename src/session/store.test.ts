import { IDBFactory } from "fake-indexeddb";
import { describe, expect, test } from "vitest";
import {
  createIndexedDbEditorSessionStore,
  createLocalStorageEditorSessionStore,
  createMemoryEditorSessionStore,
  EditorSessionError,
  type EditorSessionStore,
} from "../session.js";

let databaseCount = 0;
const stores: [string, () => EditorSessionStore][] = [
  ["memory", () => createMemoryEditorSessionStore()],
  [
    "localStorage",
    () => {
      localStorage.clear();
      return createLocalStorageEditorSessionStore({ key: "doc" });
    },
  ],
  [
    "IndexedDB",
    () =>
      createIndexedDbEditorSessionStore({
        databaseName: `session-${(databaseCount += 1)}`,
        indexedDB: new IDBFactory(),
      }),
  ],
];

describe.each(stores)("%s editor session store contract", (_name, createStore) => {
  test("reads, writes with increasing revisions, and removes slots", async () => {
    const store = createStore();
    expect(await store.read("document")).toBeNull();
    expect(await store.write("document", "a", null)).toBe(1);
    expect(await store.write("document", "b", 1)).toBe(2);
    expect(await store.read("document")).toEqual({ revision: 2, value: "b" });
    expect(await store.read("snapshot")).toBeNull();
    await store.remove("document");
    expect(await store.read("document")).toBeNull();
  });

  test("rejects stale writes and keeps the stored value", async () => {
    const store = createStore();
    await store.write("document", "a", null);
    await store.write("document", "b", 1);

    const stale = store.write("document", "stale", 1);
    await expect(stale).rejects.toBeInstanceOf(EditorSessionError);
    await expect(stale).rejects.toMatchObject({ kind: "conflict" });
    await expect(store.write("document", "again", null)).rejects.toMatchObject({
      kind: "conflict",
    });
    expect(await store.read("document")).toEqual({ revision: 2, value: "b" });
  });

  test("writes unconditionally without an expected revision", async () => {
    const store = createStore();
    await store.write("journal", "a");
    expect(await store.write("journal", "b")).toBe(2);
  });
});

test("localStorage quota and permission failures are typed", async () => {
  const quota = Object.assign(new Error("full"), { name: "QuotaExceededError" });
  const full = createLocalStorageEditorSessionStore({
    key: "doc",
    storage: {
      getItem: () => null,
      setItem: () => {
        throw quota;
      },
    } as unknown as Storage,
  });
  await expect(full.write("document", "a", null)).rejects.toMatchObject({
    cause: quota,
    kind: "quota",
  });

  const denied = createLocalStorageEditorSessionStore({
    key: "doc",
    storage: {
      getItem: () => {
        throw Object.assign(new Error("denied"), { name: "SecurityError" });
      },
    } as unknown as Storage,
  });
  await expect(denied.read("document")).rejects.toMatchObject({ kind: "permission" });
});
