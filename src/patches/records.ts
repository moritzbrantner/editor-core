import { isEditorRecord } from "../json.js";

export function isPlainEditorRecord(value: unknown): value is Record<string, unknown> {
  return isEditorRecord(value) && !Array.isArray(value);
}
