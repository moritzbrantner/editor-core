import { describe, expect, test } from "vitest";
import {
  decodeEditorSharePayload,
  editorShareTokenFromUrl,
  editorShareUrl,
  encodeEditorSharePayload,
} from "./share.js";

describe("share", () => {
  test("creates and reads share URLs", () => {
    const url = editorShareUrl("https://example.com", "/editor", "plain.token", "state");
    expect(url).toBe("https://example.com/editor?state=plain.token");
    expect(editorShareTokenFromUrl(url, "state")).toBe("plain.token");
    expect(editorShareTokenFromUrl("://bad")).toBeNull();
  });

  test("encodes and decodes plain payloads", async () => {
    const token = await encodeEditorSharePayload({ value: "short" });
    expect(token.startsWith("plain.")).toBe(true);
    await expect(decodeEditorSharePayload(token)).resolves.toEqual({ value: "short" });
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
    await expect(decodeEditorSharePayload("plain.not-json")).rejects.toThrow("invalid");
  });
});
