import { EditorPersistenceConflictError, type EditorPersistenceState } from "../persistence.js";
import {
  resetEditorRuntime,
  type EditorRuntimeSelection,
  type EditorRuntimeState,
} from "../runtime.js";
import type {
  ResolveEditorPersistenceConflictOptions,
  ResolveEditorPersistenceConflictResult,
} from "./types.js";

const defaultEditorConflictClock = () => new Date().toISOString();

export function resolveEditorPersistenceConflict<TDocument, TSelection = unknown>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  persistence: EditorPersistenceState,
  options: ResolveEditorPersistenceConflictOptions<TDocument, TSelection>,
): ResolveEditorPersistenceConflictResult<TDocument, TSelection> {
  const conflict = persistence.conflict;
  if (!conflict) {
    throw new EditorPersistenceConflictError("No editor persistence conflict is active.", {
      local: { document: runtime.document, revisionToken: persistence.revisionToken ?? null },
    });
  }

  if (options.resolution === "local") {
    return {
      document: runtime.document,
      persistence: clearResolvedConflictPersistence(persistence, conflict),
      resolution: "local",
      runtime,
    };
  }

  if (options.resolution === "remote") {
    if (!conflict.remote) {
      throw new EditorPersistenceConflictError(
        "Cannot accept remote editor persistence conflict without a remote document.",
        { local: conflict.local },
      );
    }

    const acceptedRuntime = resetEditorRuntime(runtime, conflict.remote.document as TDocument, {
      markSaved: true,
      selection: options.selection,
    });
    const timestamp = (options.now ?? defaultEditorConflictClock)();
    const revisionToken = conflict.remote.revisionToken ?? persistence.revisionToken ?? null;

    return {
      document: acceptedRuntime.document,
      persistence: {
        ...clearResolvedConflictPersistence(persistence, conflict),
        operation: "save",
        revisionToken,
        savedAt: timestamp,
        savedRevision: acceptedRuntime.savedRevision,
        savingRevision: null,
        status: "saved",
      },
      resolution: "remote",
      runtime: acceptedRuntime,
    };
  }

  if (options.mergedDocument === undefined) {
    throw new EditorPersistenceConflictError(
      "Cannot accept merged editor persistence conflict without a merged document.",
      { local: conflict.local, remote: conflict.remote },
    );
  }

  const mergedRuntime = resetEditorRuntime(runtime, options.mergedDocument, {
    selection: options.selection,
  });

  return {
    document: mergedRuntime.document,
    persistence: clearResolvedConflictPersistence(persistence, conflict),
    resolution: "merged",
    runtime: mergedRuntime,
  };
}

export function acceptLocalEditorPersistenceConflict<TDocument, TSelection = unknown>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  persistence: EditorPersistenceState,
): ResolveEditorPersistenceConflictResult<TDocument, TSelection> {
  return resolveEditorPersistenceConflict(runtime, persistence, { resolution: "local" });
}

export function acceptRemoteEditorPersistenceConflict<TDocument, TSelection = unknown>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  persistence: EditorPersistenceState,
  options: {
    selection?: EditorRuntimeSelection<TSelection>;
    now?: () => string;
  } = {},
): ResolveEditorPersistenceConflictResult<TDocument, TSelection> {
  return resolveEditorPersistenceConflict(runtime, persistence, {
    ...options,
    resolution: "remote",
  });
}

export function acceptMergedEditorPersistenceConflict<TDocument, TSelection = unknown>(
  runtime: EditorRuntimeState<TDocument, TSelection>,
  persistence: EditorPersistenceState,
  mergedDocument: TDocument,
  options: {
    selection?: EditorRuntimeSelection<TSelection>;
    now?: () => string;
  } = {},
): ResolveEditorPersistenceConflictResult<TDocument, TSelection> {
  return resolveEditorPersistenceConflict(runtime, persistence, {
    ...options,
    mergedDocument,
    resolution: "merged",
  });
}

function clearResolvedConflictPersistence(
  persistence: EditorPersistenceState,
  conflict: EditorPersistenceConflictError,
): EditorPersistenceState {
  return {
    ...persistence,
    conflict: null,
    error: persistence.error === conflict ? null : persistence.error,
    operation: null,
    savingRevision: null,
    status: persistence.error === conflict ? "idle" : persistence.status,
  };
}
