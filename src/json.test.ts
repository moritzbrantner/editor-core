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

  test("preserves __proto__ as an own JSON property without changing the result prototype", () => {
    const value = JSON.parse('{"z":1,"__proto__":{"polluted":true}}') as Record<string, unknown>;
    const sorted = sortEditorJsonValue(value) as Record<string, unknown>;

    expect(Object.getPrototypeOf(sorted)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(sorted, "__proto__")).toBe(true);
    expect(sorted.__proto__).toEqual({ polluted: true });
    expect(stableEditorJsonStringify(value)).toBe('{"__proto__":{"polluted":true},"z":1}');
  });

  test("creates own data properties without invoking inherited setters", () => {
    const key = "__editorCoreInheritedSetterTest__";
    let setterCalls = 0;
    Object.defineProperty(Object.prototype, key, {
      configurable: true,
      set() {
        setterCalls += 1;
      },
    });

    try {
      const value = { [key]: "value" };
      const sorted = sortEditorJsonValue(value) as Record<string, unknown>;

      expect(setterCalls).toBe(0);
      expect(Object.prototype.hasOwnProperty.call(sorted, key)).toBe(true);
      expect(sorted[key]).toBe("value");
      expect(stableEditorJsonStringify(value)).toBe(`{"${key}":"value"}`);
    } finally {
      delete (Object.prototype as Record<string, unknown>)[key];
    }
  });

  test("identifies plain records", () => {
    expect(isEditorRecord({})).toBe(true);
    expect(isEditorRecord([])).toBe(false);
    expect(isEditorRecord(null)).toBe(false);
  });
});
