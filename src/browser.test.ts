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

    const storage = createLocalStorageEditorStorage<{ value: number }>({ key: "editor" });
    await saveEditorStorage(storage, { value: 2 });
    await expect(loadEditorStorage(storage, { value: 0 })).resolves.toEqual({ value: 2 });

    window.localStorage.setItem("editor", "{");
    await expect(loadEditorStorage(storage, { value: 0 })).resolves.toEqual({ value: 0 });
  });

  test("writes and reads clipboard JSON with fallback", async () => {
    const fallback = {};
    await expect(writeEditorClipboardJson({ value: 1 }, { fallback })).resolves.toBe(false);
    expect(fallback).toEqual({ text: '{"value":1}' });
    await expect(readEditorClipboardJson({ fallback })).resolves.toEqual({ value: 1 });
  });
});
