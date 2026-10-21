import {
  createEditorPersistenceState,
  createEditorRuntimeConflictPersistenceController,
  EditorPersistenceConflictError,
  type EditorAutosaveOptions,
  type EditorConflictStorageAdapter,
  type EditorPersistenceScheduler,
  type EditorPersistenceState,
  type EditorRevisionToken,
  type EditorRuntimeStateUpdater,
} from "../persistence.js";
import { commitEditorRuntime, type EditorRuntimeState } from "../runtime.js";
import type { EditorTelemetry, EditorTelemetryEventMap } from "../telemetry.js";
import {
  decodeEditorSessionPayload,
  encodeEditorSessionPayload,
  type EditorSessionCodec,
} from "./codec.js";
import { toEditorSessionError, type EditorSessionError } from "./errors.js";
import type { EditorSessionSlot, EditorSessionStore } from "./store.js";

export type EditorSessionLifecycle =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "failed"
  | "conflicted"
  | "recoverable";

/**
 * Work found on load that the session will not apply or discard on its own: unsaved journal work
 * to restore, or a corrupt/unmigratable payload kept in quarantine for export.
 */
export type EditorSessionRecovery<TDocument> =
  | { kind: "unsaved"; document: TDocument }
  | { kind: "corrupt"; payload: string; error: EditorSessionError };

export type EditorSessionState<TDocument, TSelection = unknown> = {
  runtime: EditorRuntimeState<TDocument, TSelection>;
  persistence: EditorPersistenceState;
  lifecycle: EditorSessionLifecycle;
  recovery: EditorSessionRecovery<TDocument> | null;
  /** Typed diagnostic for the latest load, save, journal or recovery failure. */
  error: EditorSessionError | null;
};

export type EditorSessionOptions<TDocument, TSelection = unknown> = {
  /** Initial runtime; its document is the fallback when the store is empty or unreadable. */
  runtime: EditorRuntimeState<TDocument, TSelection>;
  store: EditorSessionStore;
  codec: EditorSessionCodec<TDocument>;
  autosave?: boolean | EditorAutosaveOptions;
  /** Journal every unsaved revision so it can be restored after an interruption. */
  journal?: boolean;
  scheduler?: EditorPersistenceScheduler;
  now?: () => string;
  /** Opt-in telemetry for save/autosave, migration and recovery outcomes. */
  telemetry?: EditorTelemetry;
};

export type EditorSession<TDocument, TSelection = unknown> = {
  getState: () => EditorSessionState<TDocument, TSelection>;
  subscribe: (listener: () => void) => () => void;
  load: () => Promise<void>;
  /** Applies a runtime transition, schedules autosave and journals unsaved work. */
  update: (updater: EditorRuntimeStateUpdater<TDocument, TSelection>) => void;
  /** Saves now, replacing any scheduled autosave. */
  flush: () => Promise<boolean>;
  cancelAutosave: () => void;
  /** Applies unsaved journal work as a dirty edit. */
  restoreRecovery: () => void;
  /** Drops the journal and quarantine after the caller has exported what it needs. */
  discardRecovery: () => Promise<void>;
  dispose: () => void;
};

type InternalState<TDocument, TSelection> = {
  runtime: EditorRuntimeState<TDocument, TSelection>;
  persistence: EditorPersistenceState;
  recovery: EditorSessionRecovery<TDocument> | null;
  storeError: EditorSessionError | null;
};

export function createEditorSession<TDocument, TSelection = unknown>(
  options: EditorSessionOptions<TDocument, TSelection>,
): EditorSession<TDocument, TSelection> {
  const { codec, store } = options;
  const fallbackDocument = options.runtime.document;
  const listeners = new Set<() => void>();
  let state: InternalState<TDocument, TSelection> = {
    persistence: createEditorPersistenceState(),
    recovery: null,
    runtime: options.runtime,
    storeError: null,
  };
  let snapshot = deriveEditorSessionState(state);

  const setState = (patch: Partial<InternalState<TDocument, TSelection>>) => {
    state = { ...state, ...patch };
    snapshot = deriveEditorSessionState(state);
    for (const listener of listeners) {
      listener();
    }
  };

  const { telemetry } = options;
  const decode = (value: string, slot: EditorSessionSlot) =>
    decodeEditorSessionPayload(observeEditorSessionMigration(codec, telemetry, slot), value);
  const tryDecode = (value: string | undefined, slot: EditorSessionSlot): TDocument | null => {
    try {
      return value === undefined ? null : decode(value, slot);
    } catch {
      return null;
    }
  };
  const maintain = async (task: () => Promise<unknown>) => {
    try {
      await task();
    } catch (error) {
      setState({ storeError: toEditorSessionError(error) });
    }
  };
  const reportRecovery = (
    status: EditorTelemetryEventMap["session.recovery"]["status"],
    recovery: EditorSessionRecovery<TDocument>,
  ) =>
    telemetry?.emit("session.recovery", {
      kind: recovery.kind,
      status,
      ...(recovery.kind === "corrupt" ? { errorKind: recovery.error.kind } : {}),
    });
  const quarantine = async (payload: string, error: unknown) => {
    await store.write("quarantine", payload);
    return { error: toEditorSessionError(error), kind: "corrupt", payload } as const;
  };

  const storage: EditorConflictStorageAdapter<TDocument> = {
    async load() {
      const record = await store.read("document");
      let recovery: EditorSessionRecovery<TDocument> | null = null;
      let document: TDocument | null = null;
      if (record) {
        try {
          document = decode(record.value, "document");
        } catch (error) {
          recovery = await quarantine(record.value, error);
          document = tryDecode((await store.read("snapshot"))?.value, "snapshot");
        }
      }
      const journal = recovery ? null : await store.read("journal");
      if (journal) {
        try {
          recovery = { document: decode(journal.value, "journal"), kind: "unsaved" };
        } catch (error) {
          recovery = await quarantine(journal.value, error);
        }
      }
      if (recovery) {
        reportRecovery("found", recovery);
      }
      setState({ recovery, storeError: null });
      return record
        ? { document: document ?? fallbackDocument, revisionToken: record.revision }
        : null;
    },
    async save(value) {
      const payload = encodeEditorSessionPayload(codec, value.document);
      let revision: number;
      try {
        revision = await store.write("document", payload, toStoreRevision(value.revisionToken));
      } catch (error) {
        const sessionError = toEditorSessionError(error);
        if (sessionError.kind !== "conflict") {
          throw sessionError;
        }
        const remote = await store.read("document").catch(() => null);
        const remoteDocument = tryDecode(remote?.value, "document");
        throw new EditorPersistenceConflictError(sessionError.message, {
          local: value,
          ...(remote && remoteDocument !== null
            ? { remote: { document: remoteDocument, revisionToken: remote.revision } }
            : {}),
        });
      }
      await maintain(async () => {
        await store.write("snapshot", payload);
        await store.remove("journal");
      });
      return { document: value.document, revisionToken: revision };
    },
  };

  const controller = createEditorRuntimeConflictPersistenceController<TDocument, TSelection>({
    autosave: options.autosave,
    getPersistence: () => state.persistence,
    getRuntime: () => state.runtime,
    ...(options.now ? { now: options.now } : {}),
    ...(options.scheduler ? { scheduler: options.scheduler } : {}),
    ...(telemetry ? { telemetry } : {}),
    setPersistence: (updater) =>
      setState({
        persistence: typeof updater === "function" ? updater(state.persistence) : updater,
      }),
    setRuntime: (updater) =>
      setState({ runtime: typeof updater === "function" ? updater(state.runtime) : updater }),
    storage,
  });

  const changed = () => {
    controller.notifyRuntimeChanged();
    const { runtime } = state;
    if (options.journal && state.recovery === null && runtime.status === "dirty") {
      void maintain(() =>
        store.write("journal", encodeEditorSessionPayload(codec, runtime.document)),
      );
    }
  };

  return {
    getState: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load: () => controller.load(),
    update(updater) {
      const runtime = typeof updater === "function" ? updater(state.runtime) : updater;
      if (runtime === state.runtime) {
        return;
      }
      setState({ runtime });
      changed();
    },
    flush() {
      controller.cancelAutosave();
      return controller.save();
    },
    cancelAutosave: () => controller.cancelAutosave(),
    restoreRecovery() {
      const { recovery } = state;
      if (recovery?.kind !== "unsaved") {
        return;
      }
      setState({ recovery: null, runtime: commitEditorRuntime(state.runtime, recovery.document) });
      reportRecovery("restored", recovery);
      changed();
    },
    async discardRecovery() {
      if (state.recovery) {
        reportRecovery("discarded", state.recovery);
      }
      await maintain(async () => {
        await store.remove("journal");
        await store.remove("quarantine");
      });
      setState({ recovery: null });
    },
    dispose() {
      controller.dispose();
      listeners.clear();
    },
  };
}

function deriveEditorSessionState<TDocument, TSelection>(
  state: InternalState<TDocument, TSelection>,
): EditorSessionState<TDocument, TSelection> {
  const { persistence, recovery, runtime } = state;
  const failure = persistence.conflict ?? persistence.error;
  return {
    error: failure ? toEditorSessionError(failure) : state.storeError,
    lifecycle: deriveLifecycle(state),
    persistence,
    recovery,
    runtime,
  };
}

function deriveLifecycle<TDocument, TSelection>(
  state: InternalState<TDocument, TSelection>,
): EditorSessionLifecycle {
  const { persistence } = state;
  if (state.recovery) return "recoverable";
  if (persistence.conflict) return "conflicted";
  if (persistence.status === "saving") return "saving";
  if (persistence.status === "error") return "failed";
  if (state.runtime.status === "dirty") return "dirty";
  if (persistence.status === "saved") return "saved";
  return "idle";
}

function toStoreRevision(token: EditorRevisionToken | null | undefined): number | null {
  if (token === null || token === undefined) {
    return null;
  }
  return typeof token === "number" ? token : Number(token);
}

/** Reports whether the codec's `migrate` hook upgraded or rejected a stored payload. */
function observeEditorSessionMigration<TDocument>(
  codec: EditorSessionCodec<TDocument>,
  telemetry: EditorTelemetry | undefined,
  slot: EditorSessionSlot,
): EditorSessionCodec<TDocument> {
  const { migrate } = codec;
  if (!telemetry || !migrate) {
    return codec;
  }
  return {
    ...codec,
    migrate(payload) {
      try {
        const migrated = migrate(payload);
        telemetry.emit("session.migration", { slot, status: "migrated" });
        return migrated;
      } catch (error) {
        telemetry.emit("session.migration", { slot, status: "failed" });
        throw error;
      }
    },
  };
}
