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

  const sortedValue: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sortedValue[key] = sortEditorJsonValue(value[key]);
  }
  return sortedValue;
}

export function stableEditorJsonStringify(value: unknown): string {
  return JSON.stringify(sortEditorJsonValue(value));
}

export function stableEditorJsonFingerprint(value: unknown): string {
  return stableEditorJsonStringify(value);
}

export function createStableEditorJsonEquals<T>(): (left: T, right: T) => boolean {
  return (left, right) =>
    Object.is(left, right) || stableEditorJsonFingerprint(left) === stableEditorJsonFingerprint(right);
}
