import type { EditorRevisionToken } from "../collaboration.js";
import type { EditorRuntimeSelection, EditorRuntimeState } from "../runtime.js";

export type EditorPersistenceStatus = "idle" | "loading" | "loaded" | "saving" | "saved" | "error";

export type EditorPersistenceOperation = "load" | "save";

export type EditorPersistenceState = {
  status: EditorPersistenceStatus;
  operation: EditorPersistenceOperation | null;
  error: unknown | null;
  loadedAt: string | null;
  savedAt: string | null;
  savedRevision: number | null;
  savingRevision: number | null;
  revisionToken?: EditorRevisionToken | null;
  conflict?: EditorPersistenceConflictError | null;
};

export type EditorPersistenceErrorContext = {
  operation: EditorPersistenceOperation;
  revision?: number;
};

export type EditorPersistenceClock = () => string;

export type EditorPersistenceEvent =
  | {
      type: "load-start";
      revision: number;
    }
  | {
      type: "load-success";
      revision: number;
      loadedAt: string;
    }
  | {
      type: "load-error";
      error: unknown;
    }
  | {
      type: "save-start";
      revision: number;
    }
  | {
      type: "save-success";
      revision: number;
      savedAt: string;
    }
  | {
      type: "save-error";
      revision: number;
      error: unknown;
    }
  | {
      type: "save-conflict";
      revision: number;
      error: EditorPersistenceConflictError;
    }
  | {
      type: "revision-token-updated";
      revisionToken: EditorRevisionToken | null;
    }
  | {
      type: "save-skipped";
      revision: number;
      reason: "clean" | "blocked" | "in-flight";
    };

export type EditorPersistenceEventHandler = (event: EditorPersistenceEvent) => void;

export type LoadEditorRuntimePersistenceOptions<TDocument, TSelection = unknown> = {
  fallback?: TDocument;
  selection?: EditorRuntimeSelection<TSelection>;
  now?: EditorPersistenceClock;
  onError?: (error: unknown, context: EditorPersistenceErrorContext) => void;
  onEvent?: EditorPersistenceEventHandler;
};

export type LoadEditorRuntimePersistenceResult<TDocument, TSelection = unknown> = {
  runtime: EditorRuntimeState<TDocument, TSelection>;
  persistence: EditorPersistenceState;
};

export type SaveEditorRuntimePersistenceOptions = {
  force?: boolean;
  now?: EditorPersistenceClock;
  onError?: (error: unknown, context: EditorPersistenceErrorContext) => void;
  onEvent?: EditorPersistenceEventHandler;
};

export type SaveEditorRuntimePersistenceResult<TDocument, TSelection = unknown> = {
  runtime: EditorRuntimeState<TDocument, TSelection>;
  persistence: EditorPersistenceState;
  saved: boolean;
  revision: number;
};

export type EditorPersistedDocument<TDocument> = {
  document: TDocument;
  revisionToken?: EditorRevisionToken | null;
  metadata?: Record<string, unknown>;
};

export class EditorPersistenceConflictError extends Error {
  readonly local: EditorPersistedDocument<unknown>;
  readonly remote?: EditorPersistedDocument<unknown>;

  constructor(
    message: string,
    options: {
      local: EditorPersistedDocument<unknown>;
      remote?: EditorPersistedDocument<unknown>;
    },
  ) {
    super(message);
    this.name = "EditorPersistenceConflictError";
    this.local = options.local;
    this.remote = options.remote;
  }
}

export type EditorPersistenceLoadedDocument<TDocument> = {
  document: TDocument;
  revisionToken: EditorRevisionToken | null;
};

export type EditorPersistenceLoadOperation<TDocument> =
  () => Promise<EditorPersistenceLoadedDocument<TDocument> | null>;

export type EditorPersistenceSaveOperation<TDocument, TSelection> = (
  runtime: EditorRuntimeState<TDocument, TSelection>,
  revisionToken: EditorRevisionToken | null,
) => Promise<EditorRevisionToken | null>;

export type EditorPersistenceRevisionOptions = {
  revisionToken?: EditorRevisionToken | null;
  emitRevisionToken?: boolean;
  handleConflicts?: boolean;
};
