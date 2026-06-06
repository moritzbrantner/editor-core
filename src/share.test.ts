import { afterEach, describe, expect, test, vi } from "vitest";
import {
  decodeEditorSharePayload,
  editorShareTokenFromUrl,
  editorShareUrl,
  encodeEditorSharePayload,
  EditorSharePayloadTooLargeError,
} from "./share.js";

describe("share", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("creates and reads share URLs", () => {
    const url = editorShareUrl("https://example.com", "/editor", "plain.token", "state");
    expect(url).toBe("https://example.com/editor?state=plain.token");
    expect(editorShareTokenFromUrl(url, "state")).toBe("plain.token");
    expect(editorShareTokenFromUrl("https://example.com/editor?share=plain.default")).toBe(
      "plain.default",
    );
    expect(editorShareUrl("https://example.com", "/editor?state=old", "plain.new", "state")).toBe(
      "https://example.com/editor?state=plain.new",
    );
    expect(editorShareTokenFromUrl("://bad")).toBeNull();
  });

  test("encodes and decodes plain payloads", async () => {
    const token = await encodeEditorSharePayload({ value: "short" });
    expect(token.startsWith("plain.")).toBe(true);
    await expect(decodeEditorSharePayload(token)).resolves.toEqual({ value: "short" });
  });

  test("rejects payloads that exceed explicit byte limits", async () => {
    await expect(encodeEditorSharePayload({ value: "too large" }, { maxBytes: 4 })).rejects.toThrow(
      EditorSharePayloadTooLargeError,
    );
  });

  test("encodes and decodes when browser base64 globals are unavailable", async () => {
    vi.stubGlobal("btoa", undefined);
    vi.stubGlobal("atob", undefined);

    const token = await encodeEditorSharePayload({ value: "node" });
    expect(token.startsWith("plain.")).toBe(true);
    await expect(decodeEditorSharePayload(token)).resolves.toEqual({ value: "node" });
  });

  test("encodes and decodes gzip payloads when compression is available", async () => {
    if (typeof CompressionStream === "undefined" || typeof DecompressionStream === "undefined") {
      return;
    }

    const token = await encodeEditorSharePayload({ value: "x".repeat(5_000) });
    if (!token.startsWith("gzip.")) {
      return;
    }

    expect(token.startsWith("gzip.")).toBe(true);
    await expect(decodeEditorSharePayload(token)).resolves.toEqual({ value: "x".repeat(5_000) });
  });

  test("rejects malformed tokens", async () => {
    await expect(decodeEditorSharePayload("bad")).rejects.toThrow("invalid");
    await expect(decodeEditorSharePayload("unknown.token")).rejects.toThrow("unknown encoding");
    await expect(decodeEditorSharePayload("v2.token")).rejects.toThrow("unknown encoding");
    await expect(decodeEditorSharePayload("plain.not-json")).rejects.toThrow("invalid");
  });

  test("rejects gzip tokens when decompression is unavailable", async () => {
    if (typeof CompressionStream === "undefined") {
      return;
    }

    const token = await encodeEditorSharePayload({ value: "x".repeat(5_000) });
    if (!token.startsWith("gzip.")) {
      return;
    }

    vi.stubGlobal("DecompressionStream", undefined);
    await expect(decodeEditorSharePayload(token)).rejects.toThrow("cannot open compressed");
  });
});
