import { afterEach, describe, expect, test } from "vitest";
import {
  createLocalStorageEditorSessionStorage,
  EditorSessionConflictError,
  EditorSessionError,
} from "./browser.js";

describe("local-storage editor session adapter", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  test("persists revisioned payloads and rejects concurrent stale writes", async () => {
    const first = createLocalStorageEditorSessionStorage<{ title: string }>({ key: "document" });
    const second = createLocalStorageEditorSessionStorage<{ title: string }>({ key: "document" });

    const initial = await first.save({ payload: { title: "Initial" }, revisionToken: null });
    expect(initial).toEqual({ payload: { title: "Initial" }, revisionToken: "1" });
    expect(await second.load()).toEqual(initial);

    const next = await first.save({ payload: { title: "First" }, revisionToken: "1" });
    expect(next.revisionToken).toBe("2");
    await expect(async () =>
      second.save({ payload: { title: "Second" }, revisionToken: "1" }),
    ).rejects.toBeInstanceOf(EditorSessionConflictError);
  });

  test.each([
    ["QuotaExceededError", "quota"],
    ["SecurityError", "permission"],
  ] as const)("classifies %s storage failures as %s", async (name, code) => {
    const storage = {
      clear() {},
      getItem() {
        return null;
      },
      key() {
        return null;
      },
      length: 0,
      removeItem() {},
      setItem() {
        throw new DOMException("Storage unavailable.", name);
      },
    } satisfies Storage;
    const adapter = createLocalStorageEditorSessionStorage({ key: "document", storage });

    try {
      await adapter.save({ payload: { title: "Draft" }, revisionToken: null });
      throw new Error("Expected adapter save to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(EditorSessionError);
      expect(error).toMatchObject({ code, operation: "save" });
    }
  });
});
