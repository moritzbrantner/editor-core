import type { EditorRevisionToken } from "./collaboration.js";

export type EditorSessionErrorCode =
  | "quota"
  | "permission"
  | "migration"
  | "validation"
  | "serialization"
  | "conflict"
  | "storage"
  | "recovery"
  | "unknown";

export type EditorSessionOperation = "load" | "save" | "journal" | "recovery";

export class EditorSessionError extends Error {
  readonly code: EditorSessionErrorCode;
  readonly operation: EditorSessionOperation;
  override readonly cause: unknown;

  constructor(
    message: string,
    options: {
      code: EditorSessionErrorCode;
      operation: EditorSessionOperation;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "EditorSessionError";
    this.code = options.code;
    this.operation = options.operation;
    this.cause = options.cause;
  }
}

export class EditorSessionConflictError extends EditorSessionError {
  readonly expectedRevisionToken: EditorRevisionToken | null;
  readonly actualRevisionToken: EditorRevisionToken | null;
  readonly remotePayload: unknown;

  constructor(options: {
    expectedRevisionToken: EditorRevisionToken | null;
    actualRevisionToken: EditorRevisionToken | null;
    remotePayload?: unknown;
  }) {
    super("Editor session write used a stale revision token.", {
      code: "conflict",
      operation: "save",
    });
    this.name = "EditorSessionConflictError";
    this.expectedRevisionToken = options.expectedRevisionToken;
    this.actualRevisionToken = options.actualRevisionToken;
    this.remotePayload = options.remotePayload;
  }
}

export type EditorSessionStorageSnapshot<TPayload> = {
  payload: TPayload;
  revisionToken: EditorRevisionToken;
};

export type EditorSessionStorageSave<TPayload> = {
  payload: TPayload;
  revisionToken: EditorRevisionToken | null;
};

export type EditorSessionStorageAdapter<TPayload> = {
  load: () =>
    | EditorSessionStorageSnapshot<TPayload>
    | null
    | Promise<EditorSessionStorageSnapshot<TPayload> | null>;
  save: (
    value: EditorSessionStorageSave<TPayload>,
  ) => EditorSessionStorageSnapshot<TPayload> | Promise<EditorSessionStorageSnapshot<TPayload>>;
  clear?: () => void | Promise<void>;
};

export type EditorSessionTimer = unknown;

export type EditorSessionScheduler = {
  setTimeout: (callback: () => void, delayMs: number) => EditorSessionTimer;
  clearTimeout: (timer: EditorSessionTimer) => void;
};
