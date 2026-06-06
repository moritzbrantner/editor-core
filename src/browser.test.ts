import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createLocalStorageEditorStorage,
  downloadEditorJson,
  ensureEditorJsonFilename,
  loadEditorStorage,
  readEditorClipboardJson,
  readEditorJsonFile,
  saveEditorStorage,
  writeEditorClipboardJson,
} from "./browser.js";

describe("browser helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  test("ensures JSON filenames and downloads JSON blobs", () => {
    expect(ensureEditorJsonFilename("document")).toBe("document.json");
    expect(ensureEditorJsonFilename("document.json")).toBe("document.json");

    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadEditorJson({ ok: true }, { filename: "download" });

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:test");
  });

  test("reads JSON files and recovers corrupt localStorage with fallback", async () => {
    await expect(readEditorJsonFile(new File(['{"value":1}'], "value.json"))).resolves.toEqual({
      value: 1,
    });
    await expect(
      readEditorJsonFile(new File(['{"value":"bad"}'], "value.json"), {
        parse(input) {
          const value = input as { value?: unknown };
          if (typeof value.value !== "number") {
            throw new Error("Expected numeric value.");
          }
          return { value: value.value };
        },
      }),
    ).rejects.toThrow("Expected numeric value.");

    const storage = createLocalStorageEditorStorage<{ value: number }>({ key: "editor" });
    await saveEditorStorage(storage, { value: 2 });
    await expect(loadEditorStorage(storage, { value: 0 })).resolves.toEqual({ value: 2 });

    window.localStorage.setItem("editor", "{");
    await expect(loadEditorStorage(storage, { value: 0 })).resolves.toEqual({ value: 0 });
  });

  test("reports storage load and save errors to opt-in handlers", async () => {
    const adapterErrors = vi.fn();
    const wrapperErrors = vi.fn();
    const storage = createLocalStorageEditorStorage<{ value: number }>({
      key: "editor",
      onError: adapterErrors,
      serialize() {
        throw new Error("cannot serialize");
      },
    });

    await expect(
      saveEditorStorage(storage, { value: 1 }, { onError: wrapperErrors }),
    ).rejects.toThrow("cannot serialize");
    expect(adapterErrors).toHaveBeenCalledWith(expect.any(Error), {
      key: "editor",
      operation: "storage-save",
    });
    expect(wrapperErrors).toHaveBeenCalledWith(expect.any(Error), {
      operation: "storage-save",
    });

    window.localStorage.setItem("editor", "{");
    await expect(
      loadEditorStorage(storage, { value: 0 }, { onError: wrapperErrors }),
    ).resolves.toEqual({ value: 0 });
    expect(adapterErrors).toHaveBeenCalledWith(expect.any(SyntaxError), {
      key: "editor",
      operation: "storage-load",
    });
    expect(wrapperErrors).toHaveBeenCalledWith(expect.any(SyntaxError), {
      operation: "storage-load",
    });
  });

  test("uses fallbacks when storage is unavailable", async () => {
    vi.stubGlobal("window", undefined);

    const storage = createLocalStorageEditorStorage<{ value: number }>({ key: "editor" });

    await expect(loadEditorStorage(storage, { value: 0 })).resolves.toEqual({ value: 0 });
    await expect(saveEditorStorage(storage, { value: 1 })).resolves.toBeUndefined();
  });

  test("writes and reads clipboard JSON with fallback", async () => {
    const fallback = {};
    vi.stubGlobal("navigator", {});

    await expect(writeEditorClipboardJson({ value: 1 }, { fallback })).resolves.toBe(false);
    expect(fallback).toEqual({ text: '{"value":1}' });
    await expect(readEditorClipboardJson({ fallback })).resolves.toEqual({ value: 1 });
  });

  test("reports clipboard read errors and parse failures to opt-in handlers", async () => {
    const onError = vi.fn();
    const fallback = { text: "{" };
    vi.stubGlobal("navigator", {
      clipboard: {
        readText: vi.fn(async () => {
          throw new Error("clipboard denied");
        }),
      },
    });

    await expect(readEditorClipboardJson({ fallback, onError })).resolves.toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), { operation: "clipboard-read" });
    expect(onError).toHaveBeenCalledWith(expect.any(SyntaxError), {
      operation: "clipboard-read",
    });
  });
});
