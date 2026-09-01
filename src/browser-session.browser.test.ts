import { afterEach, describe, expect, test } from "vitest";
import { createIndexedDbEditorSessionStorage, EditorSessionConflictError } from "./browser.js";

const databaseNames = new Set<string>();

describe("IndexedDB editor session adapter", () => {
  afterEach(async () => {
    await Promise.all([...databaseNames].map(deleteDatabase));
    databaseNames.clear();
  });

  test("persists revisioned payloads and rejects concurrent stale writes", async () => {
    const databaseName = `editor-core-session-${crypto.randomUUID()}`;
    databaseNames.add(databaseName);
    const first = createIndexedDbEditorSessionStorage<{ title: string }>({
      databaseName,
      key: "document",
    });
    const second = createIndexedDbEditorSessionStorage<{ title: string }>({
      databaseName,
      key: "document",
    });

    const initial = await first.save({ payload: { title: "Initial" }, revisionToken: null });
    expect(initial).toEqual({ payload: { title: "Initial" }, revisionToken: "1" });
    expect(await second.load()).toEqual(initial);

    const next = await first.save({ payload: { title: "First" }, revisionToken: "1" });
    expect(next.revisionToken).toBe("2");
    await expect(
      second.save({ payload: { title: "Second" }, revisionToken: "1" }),
    ).rejects.toBeInstanceOf(EditorSessionConflictError);

    await first.clear?.();
    expect(await first.load()).toBeNull();
  });
});

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
