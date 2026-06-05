import { describe, expect, test } from "vitest";
import {
  createStableEditorJsonEquals,
  isEditorRecord,
  sortEditorJsonValue,
  stableEditorJsonFingerprint,
  stableEditorJsonStringify,
} from "./json.js";

describe("json", () => {
  test("sorts object keys recursively and fingerprints stable JSON", () => {
    const left = { b: 1, a: { d: true, c: [2, { y: null, x: "value" }] } };
    const right = { a: { c: [2, { x: "value", y: null }], d: true }, b: 1 };

    expect(sortEditorJsonValue(left)).toEqual({
      a: { c: [2, { x: "value", y: null }], d: true },
      b: 1,
    });
    expect(stableEditorJsonStringify(left)).toBe(stableEditorJsonStringify(right));
    expect(stableEditorJsonFingerprint(left)).toBe(stableEditorJsonFingerprint(right));
    expect(createStableEditorJsonEquals<typeof left>()(left, right as typeof left)).toBe(true);
  });

  test("identifies plain records", () => {
    expect(isEditorRecord({})).toBe(true);
    expect(isEditorRecord([])).toBe(false);
    expect(isEditorRecord(null)).toBe(false);
  });
});
