import type {
  EditorSession,
  EditorSessionControllerState,
  EditorSessionOptions,
  EditorSessionState,
} from "./session-types.js";
import { EditorSessionConflictError, EditorSessionError } from "../session.js";
import { toEditorSessionError } from "./session-diagnostics.js";
import { defaultEditorSessionScheduler } from "./session-scheduler.js";

const defaultEditorSessionAutosaveDelayMs = 750;

export function createEditorSession<TDocument, TPayload>(
  options: EditorSessionOptions<TDocument, TPayload>,
): EditorSession<TDocument, TPayload> {
  let state: EditorSessionState<TDocument, TPayload> = {
    document: options.initialDocument,
    lastKnownGood: null,
    revisionToken: null,
    status: "idle",
  };
  const listeners = new Set<() => void>();
  const controller: EditorSessionControllerState = {
    autosaveTimer: null,
    disposed: false,
    pendingSave: null,
    saveInFlight: null,
  };
  const scheduler = options.scheduler ?? defaultEditorSessionScheduler;

  const session: EditorSession<TDocument, TPayload> = {
    cancelAutosave() {
      clearAutosave();
    },
    async dispose() {
      controller.disposed = true;
      clearAutosave();
      if (controller.saveInFlight) {
        await controller.saveInFlight;
      }
      listeners.clear();
    },
    async flush() {
      clearAutosave();
      if (controller.pendingSave) {
        return controller.pendingSave;
      }
      return session.save();
    },
    exportRecoveryPayload() {
      return state.status === "recoverable" ? state.recoveryPayload : null;
    },
    getState() {
      return state;
    },
    async load() {
      if (controller.disposed) {
        return false;
      }
      clearAutosave();
      let stored;
      try {
        stored = await options.storage.load();
      } catch (error) {
        setState({
          ...state,
          error: toEditorSessionError(error, "load", "storage"),
          status: "failed",
        });
        return false;
      }
      if (stored === null) {
        const emptyState: EditorSessionState<TDocument, TPayload> = {
          document: options.initialDocument,
          lastKnownGood: null,
          revisionToken: null,
          status: "idle",
        };
        setState(await restoreJournal(emptyState));
        return false;
      }
      try {
        const document = await options.document.parse(stored.payload);
        const loadedState: EditorSessionState<TDocument, TPayload> = {
          document,
          lastKnownGood: {
            document,
            payload: stored.payload,
            revisionToken: stored.revisionToken,
          },
          revisionToken: stored.revisionToken,
          status: "saved",
        };
        setState(await restoreJournal(loadedState));
        return true;
      } catch (error) {
        setState({
          document: state.document,
          error: toEditorSessionError(error, "load", "validation"),
          lastKnownGood: state.lastKnownGood,
          recoveryPayload: stored.payload,
          revisionToken: stored.revisionToken,
          status: "recoverable",
        });
        return false;
      }
    },
    async recover(document) {
      if (state.status !== "recoverable") {
        return;
      }
      setState({
        document,
        lastKnownGood: state.lastKnownGood,
        revisionToken: state.revisionToken,
        status: "dirty",
      });
      scheduleAutosave();
    },
    async save(saveOptions = {}) {
      if (controller.saveInFlight) {
        return controller.saveInFlight;
      }
      const saveTask = saveDocument(saveOptions);
      controller.saveInFlight = saveTask;
      try {
        return await saveTask;
      } finally {
        if (controller.saveInFlight === saveTask) {
          controller.saveInFlight = null;
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async updateDocument(document) {
      if (controller.disposed || options.equals(state.document, document)) {
        return;
      }
      controller.pendingSave = null;
      const status =
        state.lastKnownGood && options.equals(state.lastKnownGood.document, document)
          ? "saved"
          : "dirty";
      setState({
        document,
        lastKnownGood: state.lastKnownGood,
        revisionToken: state.revisionToken,
        status,
      });
      if (options.journal) {
        try {
          await options.journal.save(document);
        } catch (error) {
          setState({
            ...state,
            error: toEditorSessionError(error, "journal", "storage"),
            status: "failed",
          });
          return;
        }
      }
      scheduleAutosave();
    },
  };

  async function saveDocument(saveOptions: { force?: boolean }): Promise<boolean> {
    const canSave =
      state.status === "dirty" || state.status === "failed" || state.status === "conflicted";
    if (controller.disposed || (!canSave && !saveOptions.force)) {
      return false;
    }

    const document = state.document;
    const revisionToken = state.revisionToken;
    setState({ ...state, status: "saving" });

    let payload: TPayload;
    try {
      payload = await options.document.serialize(document);
    } catch (error) {
      setState({
        ...state,
        error: toEditorSessionError(error, "save", "serialization"),
        status: "failed",
      });
      return false;
    }

    try {
      const stored = await options.storage.save({
        payload,
        revisionToken,
      });
      const lastKnownGood = {
        document,
        payload: stored.payload,
        revisionToken: stored.revisionToken,
      };
      const currentDocument = state.document;
      const savedCurrentDocument = options.equals(currentDocument, document);
      setState({
        document: currentDocument,
        lastKnownGood,
        revisionToken: stored.revisionToken,
        status: savedCurrentDocument ? "saved" : "dirty",
      });
      if (savedCurrentDocument) {
        await options.journal?.clear();
      }
      return true;
    } catch (error) {
      setState({
        ...state,
        error: toEditorSessionError(error, "save", "storage"),
        status: error instanceof EditorSessionConflictError ? "conflicted" : "failed",
      });
      return false;
    }
  }

  function setState(nextState: EditorSessionState<TDocument, TPayload>): void {
    state = nextState;
    for (const listener of listeners) {
      listener();
    }
  }

  function clearAutosave(): void {
    if (controller.autosaveTimer === null) {
      return;
    }
    scheduler.clearTimeout(controller.autosaveTimer);
    controller.autosaveTimer = null;
  }

  function scheduleAutosave(): void {
    clearAutosave();
    if (options.autosave === false) {
      return;
    }
    controller.autosaveTimer = scheduler.setTimeout(() => {
      controller.autosaveTimer = null;
      controller.pendingSave = session.save();
    }, options.autosave?.delayMs ?? defaultEditorSessionAutosaveDelayMs);
  }

  async function restoreJournal(
    loadedState: EditorSessionState<TDocument, TPayload>,
  ): Promise<EditorSessionState<TDocument, TPayload>> {
    if (!options.journal) {
      return loadedState;
    }
    try {
      const journalDocument = await options.journal.load();
      if (journalDocument === null || options.equals(journalDocument, loadedState.document)) {
        return loadedState;
      }
      return {
        document: journalDocument,
        error: new EditorSessionError("Unsaved editor session work is available for recovery.", {
          code: "recovery",
          operation: "journal",
        }),
        lastKnownGood: loadedState.lastKnownGood,
        recoveryPayload: journalDocument,
        revisionToken: loadedState.revisionToken,
        status: "recoverable",
      };
    } catch (error) {
      return {
        ...loadedState,
        error: toEditorSessionError(error, "journal", "storage"),
        status: "failed",
      };
    }
  }

  return session;
}
