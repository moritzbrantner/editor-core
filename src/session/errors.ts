import { EditorPersistenceConflictError } from "../persistence.js";

export type EditorSessionErrorKind =
  | "quota"
  | "permission"
  | "migration"
  | "validation"
  | "serialization"
  | "conflict"
  | "storage";

/** Typed diagnostic for every failure an editor session reports. */
export class EditorSessionError extends Error {
  readonly kind: EditorSessionErrorKind;
  override readonly cause: unknown;

  constructor(kind: EditorSessionErrorKind, message: string, options: { cause?: unknown } = {}) {
    super(message);
    this.name = "EditorSessionError";
    this.kind = kind;
    this.cause = options.cause;
  }
}

const quotaErrorNames = new Set(["QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED"]);
const permissionErrorNames = new Set(["SecurityError", "NotAllowedError", "InvalidAccessError"]);

/** Classifies any thrown value into an `EditorSessionError`, keeping the original as `cause`. */
export function toEditorSessionError(
  error: unknown,
  fallbackKind: EditorSessionErrorKind = "storage",
): EditorSessionError {
  if (error instanceof EditorSessionError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof EditorPersistenceConflictError) {
    return new EditorSessionError("conflict", message, { cause: error });
  }
  const name =
    typeof error === "object" && error !== null ? (error as { name?: unknown }).name : "";
  if (typeof name === "string" && quotaErrorNames.has(name)) {
    return new EditorSessionError("quota", message, { cause: error });
  }
  if (typeof name === "string" && permissionErrorNames.has(name)) {
    return new EditorSessionError("permission", message, { cause: error });
  }
  return new EditorSessionError(fallbackKind, message, { cause: error });
}
