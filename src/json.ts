export type EditorJsonPrimitive = string | number | boolean | null;
export type EditorJsonValue = EditorJsonPrimitive | EditorJsonObject | EditorJsonValue[];
export type EditorJsonObject = { [key: string]: EditorJsonValue };

export function isEditorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sortEditorJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortEditorJsonValue);
  }

  if (!isEditorRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortEditorJsonValue(value[key])]),
  );
}

export function stableEditorJsonStringify(value: unknown): string {
  return JSON.stringify(sortEditorJsonValue(value));
}

export function stableEditorJsonFingerprint(value: unknown): string {
  return stableEditorJsonStringify(value);
}

export function createStableEditorJsonEquals<T>(): (left: T, right: T) => boolean {
  return (left, right) => stableEditorJsonFingerprint(left) === stableEditorJsonFingerprint(right);
}
