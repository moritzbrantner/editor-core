import type {
  EditorSessionError,
  EditorSessionScheduler,
  EditorSessionStorageAdapter,
  EditorSessionTimer,
} from "../session.js";
import type { EditorRevisionToken } from "../collaboration.js";

export type EditorSessionDocumentAdapter<TDocument, TPayload> = {
  parse: (payload: TPayload) => TDocument | Promise<TDocument>;
  serialize: (document: TDocument) => TPayload | Promise<TPayload>;
};

export type EditorSessionJournalAdapter<TDocument> = {
  load: () => TDocument | null | Promise<TDocument | null>;
  save: (document: TDocument) => void | Promise<void>;
  clear: () => void | Promise<void>;
};

export type EditorSessionSnapshot<TDocument, TPayload> = {
  document: TDocument;
  payload: TPayload;
  revisionToken: EditorRevisionToken;
};

type EditorSessionStateBase<TDocument, TPayload> = {
  document: TDocument;
  lastKnownGood: EditorSessionSnapshot<TDocument, TPayload> | null;
  revisionToken: EditorRevisionToken | null;
};

export type EditorSessionState<TDocument, TPayload> = EditorSessionStateBase<TDocument, TPayload> &
  (
    | { status: "idle" }
    | { status: "dirty" }
    | { status: "saving" }
    | { status: "saved" }
    | { status: "failed"; error: EditorSessionError }
    | { status: "conflicted"; error: EditorSessionError }
    | { status: "recoverable"; error: EditorSessionError; recoveryPayload: unknown }
  );

export type EditorSessionAutosaveOptions = {
  delayMs?: number;
};

export type EditorSessionOptions<TDocument, TPayload> = {
  initialDocument: TDocument;
  document: EditorSessionDocumentAdapter<TDocument, TPayload>;
  storage: EditorSessionStorageAdapter<TPayload>;
  equals: (left: TDocument, right: TDocument) => boolean;
  autosave?: false | EditorSessionAutosaveOptions;
  journal?: EditorSessionJournalAdapter<TDocument>;
  scheduler?: EditorSessionScheduler;
};

export type EditorSession<TDocument, TPayload> = {
  getState: () => EditorSessionState<TDocument, TPayload>;
  exportRecoveryPayload: () => unknown | null;
  subscribe: (listener: () => void) => () => void;
  load: () => Promise<boolean>;
  recover: (document: TDocument) => Promise<void>;
  updateDocument: (document: TDocument) => Promise<void>;
  save: (options?: { force?: boolean }) => Promise<boolean>;
  flush: () => Promise<boolean>;
  cancelAutosave: () => void;
  dispose: () => Promise<void>;
};

export type EditorSessionControllerState = {
  autosaveTimer: EditorSessionTimer | null;
  disposed: boolean;
  pendingSave: Promise<boolean> | null;
  saveInFlight: Promise<boolean> | null;
};
