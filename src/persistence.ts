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

type EditorPersistenceLoadedDocument<TDocument> = {
  document: TDocument;
  revisionToken: EditorRevisionToken | null;
};

type EditorPersistenceLoadOperation<TDocument> =
  () => Promise<EditorPersistenceLoadedDocument<TDocument> | null>;

type EditorPersistenceSaveOperation<TDocument, TSelection> = (
  runtime: EditorRuntimeState<TDocument, TSelection>,
  revisionToken: EditorRevisionToken | null,
) => Promise<EditorRevisionToken | null>;

type EditorPersistenceRevisionOptions = {
  revisionToken?: EditorRevisionToken | null;
  emitRevisionToken?: boolean;
  handleConflicts?: boolean;
};

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
  return loadEditorRuntimePersistenceCore(
    runtime,
    async () => {
      const document = await storage.load();
      return document === null ? null : { document, revisionToken: null };
    },
    options,
  );
}

export async function saveEditorRuntimePersistence<TDocument, TSelection = unknown>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  storage: EditorStorageAdapter<TDocument>,
  options: SaveEditorRuntimePersistenceOptions = {},
): Promise<SaveEditorRuntimePersistenceResult<TDocument, TSelection>> {
  return saveEditorRuntimePersistenceCore(
    runtime,
    async (snapshot) => {
      await storage.save(snapshot.document);
      return null;
    },
    options,
  );
}

export async function loadEditorRuntimeConflictPersistence<TDocument, TSelection = unknown>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  storage: EditorConflictStorageAdapter<TDocument>,
  options: LoadEditorRuntimeConflictPersistenceOptions<TDocument, TSelection> = {},
): Promise<LoadEditorRuntimeConflictPersistenceResult<TDocument, TSelection>> {
  return loadEditorRuntimePersistenceCore(
    runtime,
    async () => {
      const persisted = await storage.load();
      return persisted
        ? {
            document: persisted.document,
            revisionToken: persisted.revisionToken ?? null,
          }
        : null;
    },
    options,
    { emitRevisionToken: true },
  );
}

export async function saveEditorRuntimeConflictPersistence<TDocument, TSelection = unknown>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  storage: EditorConflictStorageAdapter<TDocument>,
  options: SaveEditorRuntimeConflictPersistenceOptions = {},
): Promise<SaveEditorRuntimeConflictPersistenceResult<TDocument, TSelection>> {
  return saveEditorRuntimePersistenceCore(
    runtime,
    async (snapshot, revisionToken) => {
      const savedDocument = await storage.save({
        document: snapshot.document,
        revisionToken,
      });
      return savedDocument.revisionToken ?? null;
    },
    options,
    { emitRevisionToken: true, handleConflicts: true, revisionToken: options.revisionToken },
  );
}

async function loadEditorRuntimePersistenceCore<TDocument, TSelection>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  loadDocument: EditorPersistenceLoadOperation<TDocument>,
  options: LoadEditorRuntimePersistenceOptions<TDocument, TSelection>,
  revisionOptions: EditorPersistenceRevisionOptions = {},
): Promise<LoadEditorRuntimePersistenceResult<TDocument, TSelection>> {
  const now = options.now ?? defaultEditorPersistenceClock;
  options.onEvent?.({ revision: runtime.revision, type: "load-start" });

  try {
    const persisted = await loadDocument();
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
    emitRevisionTokenUpdated(options, revisionToken, revisionOptions);

    return {
      persistence: createLoadedPersistenceState({
        revision: loadedRuntime.revision,
        revisionToken,
        timestamp,
      }),
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
      persistence: createLoadErrorPersistenceState({
        error,
        revision: fallbackRuntime.revision,
        revisionToken: null,
      }),
      runtime: fallbackRuntime,
    };
  }
}

async function saveEditorRuntimePersistenceCore<TDocument, TSelection>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  saveDocument: EditorPersistenceSaveOperation<TDocument, TSelection>,
  options: SaveEditorRuntimePersistenceOptions,
  revisionOptions: EditorPersistenceRevisionOptions = {},
): Promise<SaveEditorRuntimePersistenceResult<TDocument, TSelection>> {
  const revision = runtime.revision;
  const now = options.now ?? defaultEditorPersistenceClock;
  const revisionToken = revisionOptions.revisionToken ?? null;

  if (runtime.status === "clean" && !options.force) {
    options.onEvent?.({
      reason: "clean",
      revision,
      type: "save-skipped",
    });
    return {
      persistence: createSkippedSavePersistenceState({
        revisionToken,
        savedRevision: runtime.savedRevision,
      }),
      revision,
      runtime,
      saved: false,
    };
  }

  options.onEvent?.({ revision, type: "save-start" });

  try {
    const savedRevisionToken = await saveDocument(runtime, revisionToken);
    const savedRuntime = markEditorRuntimeSaved(runtime);
    const timestamp = now();
    options.onEvent?.({ revision, savedAt: timestamp, type: "save-success" });
    emitRevisionTokenUpdated(options, savedRevisionToken, revisionOptions);

    return {
      persistence: createSavedPersistenceState({
        revision,
        revisionToken: savedRevisionToken,
        timestamp,
      }),
      revision,
      runtime: savedRuntime,
      saved: true,
    };
  } catch (error) {
    if (revisionOptions.handleConflicts && error instanceof EditorPersistenceConflictError) {
      options.onError?.(error, { operation: "save", revision });
      options.onEvent?.({ error, revision, type: "save-conflict" });

      return {
        persistence: createSaveErrorPersistenceState({
          conflict: error,
          error,
          revisionToken,
          savedRevision: runtime.savedRevision,
        }),
        revision,
        runtime,
        saved: false,
      };
    }

    options.onError?.(error, { operation: "save", revision });
    options.onEvent?.({ error, revision, type: "save-error" });

    return {
      persistence: createSaveErrorPersistenceState({
        conflict: null,
        error,
        revisionToken,
        savedRevision: runtime.savedRevision,
      }),
      revision,
      runtime,
      saved: false,
    };
  }
}

function createLoadedPersistenceState(options: {
  revision: number;
  revisionToken: EditorRevisionToken | null;
  timestamp: string;
}): EditorPersistenceState {
  return {
    conflict: null,
    error: null,
    loadedAt: options.timestamp,
    operation: "load",
    revisionToken: options.revisionToken,
    savedAt: options.timestamp,
    savedRevision: options.revision,
    savingRevision: null,
    status: "loaded",
  };
}

function createLoadErrorPersistenceState(options: {
  error: unknown;
  revision: number;
  revisionToken: EditorRevisionToken | null;
}): EditorPersistenceState {
  return {
    conflict: null,
    error: options.error,
    loadedAt: null,
    operation: "load",
    revisionToken: options.revisionToken,
    savedAt: null,
    savedRevision: options.revision,
    savingRevision: null,
    status: "error",
  };
}

function createSkippedSavePersistenceState(options: {
  revisionToken: EditorRevisionToken | null;
  savedRevision: number;
}): EditorPersistenceState {
  return {
    conflict: null,
    error: null,
    loadedAt: null,
    operation: null,
    revisionToken: options.revisionToken,
    savedAt: null,
    savedRevision: options.savedRevision,
    savingRevision: null,
    status: "idle",
  };
}

function createSavedPersistenceState(options: {
  revision: number;
  revisionToken: EditorRevisionToken | null;
  timestamp: string;
}): EditorPersistenceState {
  return {
    conflict: null,
    error: null,
    loadedAt: null,
    operation: "save",
    revisionToken: options.revisionToken,
    savedAt: options.timestamp,
    savedRevision: options.revision,
    savingRevision: null,
    status: "saved",
  };
}

function createSaveErrorPersistenceState(options: {
  conflict: EditorPersistenceConflictError | null;
  error: unknown;
  revisionToken: EditorRevisionToken | null;
  savedRevision: number;
}): EditorPersistenceState {
  return {
    conflict: options.conflict,
    error: options.error,
    loadedAt: null,
    operation: "save",
    revisionToken: options.revisionToken,
    savedAt: null,
    savedRevision: options.savedRevision,
    savingRevision: null,
    status: "error",
  };
}

function emitRevisionTokenUpdated<TDocument>(
  options: { onEvent?: EditorPersistenceEventHandler<TDocument> },
  revisionToken: EditorRevisionToken | null,
  revisionOptions: EditorPersistenceRevisionOptions,
): void {
  if (!revisionOptions.emitRevisionToken) {
    return;
  }

  options.onEvent?.({ revisionToken, type: "revision-token-updated" });
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
