import {
  EditorSessionError,
  type EditorSessionErrorCode,
  type EditorSessionOperation,
} from "../session.js";

export function toEditorSessionError(
  error: unknown,
  operation: Extract<EditorSessionOperation, "load" | "save" | "journal">,
  fallbackCode: EditorSessionErrorCode,
): EditorSessionError {
  if (error instanceof EditorSessionError) {
    return error;
  }
  const code =
    error instanceof Error && error.name === "EditorMigrationError"
      ? "migration"
      : error instanceof Error && error.name === "EditorJsonParseError"
        ? "validation"
        : fallbackCode;
  return new EditorSessionError(error instanceof Error ? error.message : "Editor session failed.", {
    cause: error,
    code,
    operation,
  });
}
