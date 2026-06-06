import type { EditorStorageAdapter } from "./browser.js";
import type { EditorRevisionToken } from "./collaboration.js";
import {
  markEditorRuntimeSaved,
  resetEditorRuntime,
  type EditorRuntimeSelection,
  type EditorRuntimeState,
} from "./runtime.js";

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

export type EditorPersistenceEvent<_TDocument = unknown> =
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

export type EditorPersistenceEventHandler<TDocument = unknown> = (
  event: EditorPersistenceEvent<TDocument>,
) => void;

export type CreateEditorPersistenceStateOptions = {
  now?: EditorPersistenceClock;
};

export type LoadEditorRuntimePersistenceOptions<TDocument, TSelection = unknown> = {
  fallback?: TDocument;
  selection?: EditorRuntimeSelection<TSelection>;
  now?: EditorPersistenceClock;
  onError?: (error: unknown, context: EditorPersistenceErrorContext) => void;
  onEvent?: EditorPersistenceEventHandler<TDocument>;
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

export type EditorConflictStorageAdapter<TDocument> = {
  load: () =>
    | EditorPersistedDocument<TDocument>
    | null
    | Promise<EditorPersistedDocument<TDocument> | null>;
  save: (
    value: EditorPersistedDocument<TDocument>,
  ) => EditorPersistedDocument<TDocument> | Promise<EditorPersistedDocument<TDocument>>;
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

export type LoadEditorRuntimeConflictPersistenceOptions<
  TDocument,
  TSelection = unknown,
> = LoadEditorRuntimePersistenceOptions<TDocument, TSelection>;

export type LoadEditorRuntimeConflictPersistenceResult<
  TDocument,
  TSelection = unknown,
> = LoadEditorRuntimePersistenceResult<TDocument, TSelection>;

export type SaveEditorRuntimeConflictPersistenceOptions = SaveEditorRuntimePersistenceOptions & {
  revisionToken?: EditorRevisionToken | null;
};

export type SaveEditorRuntimeConflictPersistenceResult<
  TDocument,
  TSelection = unknown,
> = SaveEditorRuntimePersistenceResult<TDocument, TSelection>;

const defaultEditorPersistenceClock: EditorPersistenceClock = () => new Date().toISOString();

export function createEditorPersistenceState(
  options: CreateEditorPersistenceStateOptions = {},
): EditorPersistenceState {
  void options;

  return {
    error: null,
    loadedAt: null,
    operation: null,
    savedAt: null,
    savedRevision: null,
    savingRevision: null,
    revisionToken: null,
    conflict: null,
    status: "idle",
  };
}

export async function loadEditorRuntimePersistence<TDocument, TSelection = unknown>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  storage: EditorStorageAdapter<TDocument>,
  options: LoadEditorRuntimePersistenceOptions<TDocument, TSelection> = {},
): Promise<LoadEditorRuntimePersistenceResult<TDocument, TSelection>> {
  const now = options.now ?? defaultEditorPersistenceClock;
  options.onEvent?.({ revision: runtime.revision, type: "load-start" });

  try {
    const storedDocument = await storage.load();
    const document = storedDocument ?? options.fallback ?? runtime.document;
    const loadedRuntime = resetEditorRuntime(runtime, document, {
      markSaved: true,
      selection: options.selection,
    });
    const timestamp = now();
    options.onEvent?.({
      loadedAt: timestamp,
      revision: loadedRuntime.revision,
      type: "load-success",
    });

    return {
      persistence: {
        error: null,
        loadedAt: timestamp,
        operation: "load",
        savedAt: timestamp,
        savedRevision: loadedRuntime.revision,
        savingRevision: null,
        revisionToken: null,
        conflict: null,
        status: "loaded",
      },
      runtime: loadedRuntime,
    };
  } catch (error) {
    options.onError?.(error, { operation: "load" });
    options.onEvent?.({ error, type: "load-error" });

    const document = options.fallback ?? runtime.document;
    const fallbackRuntime = resetEditorRuntime(runtime, document, {
      markSaved: true,
      selection: options.selection,
    });

    return {
      persistence: {
        error,
        loadedAt: null,
        operation: "load",
        savedAt: null,
        savedRevision: fallbackRuntime.revision,
        savingRevision: null,
        revisionToken: null,
        conflict: null,
        status: "error",
      },
      runtime: fallbackRuntime,
    };
  }
}

export async function saveEditorRuntimePersistence<TDocument, TSelection = unknown>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  storage: EditorStorageAdapter<TDocument>,
  options: SaveEditorRuntimePersistenceOptions = {},
): Promise<SaveEditorRuntimePersistenceResult<TDocument, TSelection>> {
  const revision = runtime.revision;
  const now = options.now ?? defaultEditorPersistenceClock;

  if (runtime.status === "clean" && !options.force) {
    options.onEvent?.({
      reason: "clean",
      revision,
      type: "save-skipped",
    });
    return {
      persistence: {
        error: null,
        loadedAt: null,
        operation: null,
        savedAt: null,
        savedRevision: runtime.savedRevision,
        savingRevision: null,
        revisionToken: null,
        conflict: null,
        status: "idle",
      },
      revision,
      runtime,
      saved: false,
    };
  }

  options.onEvent?.({ revision, type: "save-start" });

  try {
    await storage.save(runtime.document);
    const savedRuntime = markEditorRuntimeSaved(runtime);
    const timestamp = now();
    options.onEvent?.({ revision, savedAt: timestamp, type: "save-success" });

    return {
      persistence: {
        error: null,
        loadedAt: null,
        operation: "save",
        savedAt: timestamp,
        savedRevision: revision,
        savingRevision: null,
        revisionToken: null,
        conflict: null,
        status: "saved",
      },
      revision,
      runtime: savedRuntime,
      saved: true,
    };
  } catch (error) {
    options.onError?.(error, { operation: "save", revision });
    options.onEvent?.({ error, revision, type: "save-error" });

    return {
      persistence: {
        error,
        loadedAt: null,
        operation: "save",
        savedAt: null,
        savedRevision: runtime.savedRevision,
        savingRevision: null,
        revisionToken: null,
        conflict: null,
        status: "error",
      },
      revision,
      runtime,
      saved: false,
    };
  }
}

export async function loadEditorRuntimeConflictPersistence<TDocument, TSelection = unknown>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  storage: EditorConflictStorageAdapter<TDocument>,
  options: LoadEditorRuntimeConflictPersistenceOptions<TDocument, TSelection> = {},
): Promise<LoadEditorRuntimeConflictPersistenceResult<TDocument, TSelection>> {
  const now = options.now ?? defaultEditorPersistenceClock;
  options.onEvent?.({ revision: runtime.revision, type: "load-start" });

  try {
    const persisted = await storage.load();
    const document = persisted?.document ?? options.fallback ?? runtime.document;
    const loadedRuntime = resetEditorRuntime(runtime, document, {
      markSaved: true,
      selection: options.selection,
    });
    const timestamp = now();
    const revisionToken = persisted?.revisionToken ?? null;
    options.onEvent?.({
      loadedAt: timestamp,
      revision: loadedRuntime.revision,
      type: "load-success",
    });
    options.onEvent?.({ revisionToken, type: "revision-token-updated" });

    return {
      persistence: {
        conflict: null,
        error: null,
        loadedAt: timestamp,
        operation: "load",
        revisionToken,
        savedAt: timestamp,
        savedRevision: loadedRuntime.revision,
        savingRevision: null,
        status: "loaded",
      },
      runtime: loadedRuntime,
    };
  } catch (error) {
    options.onError?.(error, { operation: "load" });
    options.onEvent?.({ error, type: "load-error" });

    const document = options.fallback ?? runtime.document;
    const fallbackRuntime = resetEditorRuntime(runtime, document, {
      markSaved: true,
      selection: options.selection,
    });

    return {
      persistence: {
        conflict: null,
        error,
        loadedAt: null,
        operation: "load",
        revisionToken: null,
        savedAt: null,
        savedRevision: fallbackRuntime.revision,
        savingRevision: null,
        status: "error",
      },
      runtime: fallbackRuntime,
    };
  }
}

export async function saveEditorRuntimeConflictPersistence<TDocument, TSelection = unknown>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  storage: EditorConflictStorageAdapter<TDocument>,
  options: SaveEditorRuntimeConflictPersistenceOptions = {},
): Promise<SaveEditorRuntimeConflictPersistenceResult<TDocument, TSelection>> {
  const revision = runtime.revision;
  const now = options.now ?? defaultEditorPersistenceClock;

  if (runtime.status === "clean" && !options.force) {
    options.onEvent?.({
      reason: "clean",
      revision,
      type: "save-skipped",
    });
    return {
      persistence: {
        conflict: null,
        error: null,
        loadedAt: null,
        operation: null,
        revisionToken: options.revisionToken ?? null,
        savedAt: null,
        savedRevision: runtime.savedRevision,
        savingRevision: null,
        status: "idle",
      },
      revision,
      runtime,
      saved: false,
    };
  }

  options.onEvent?.({ revision, type: "save-start" });

  try {
    const savedDocument = await storage.save({
      document: runtime.document,
      revisionToken: options.revisionToken ?? null,
    });
    const savedRuntime = markEditorRuntimeSaved(runtime);
    const timestamp = now();
    const revisionToken = savedDocument.revisionToken ?? null;
    options.onEvent?.({ revision, savedAt: timestamp, type: "save-success" });
    options.onEvent?.({ revisionToken, type: "revision-token-updated" });

    return {
      persistence: {
        conflict: null,
        error: null,
        loadedAt: null,
        operation: "save",
        revisionToken,
        savedAt: timestamp,
        savedRevision: revision,
        savingRevision: null,
        status: "saved",
      },
      revision,
      runtime: savedRuntime,
      saved: true,
    };
  } catch (error) {
    if (error instanceof EditorPersistenceConflictError) {
      options.onError?.(error, { operation: "save", revision });
      options.onEvent?.({ error, revision, type: "save-conflict" });

      return {
        persistence: {
          conflict: error,
          error,
          loadedAt: null,
          operation: "save",
          revisionToken: options.revisionToken ?? null,
          savedAt: null,
          savedRevision: runtime.savedRevision,
          savingRevision: null,
          status: "error",
        },
        revision,
        runtime,
        saved: false,
      };
    }

    options.onError?.(error, { operation: "save", revision });
    options.onEvent?.({ error, revision, type: "save-error" });

    return {
      persistence: {
        conflict: null,
        error,
        loadedAt: null,
        operation: "save",
        revisionToken: options.revisionToken ?? null,
        savedAt: null,
        savedRevision: runtime.savedRevision,
        savingRevision: null,
        status: "error",
      },
      revision,
      runtime,
      saved: false,
    };
  }
}

export function clearEditorPersistenceConflict(
  persistence: EditorPersistenceState,
): EditorPersistenceState {
  return {
    ...persistence,
    conflict: null,
    error: persistence.error === persistence.conflict ? null : persistence.error,
  };
}
