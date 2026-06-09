import type { EditorChangeOrigin } from "../aspects.js";
import type {
  DedupeEditorRemoteOperationsOptions,
  EditorClientId,
  EditorCollaborationState,
  EditorRemoteOperation,
} from "../collaboration.js";
import type { EditorOperation, EditorOperationRuntimeState } from "../operations.js";
import type { EditorPersistenceClock, EditorPersistenceState } from "../persistence.js";
import type { EditorRuntimeSelection, EditorRuntimeState } from "../runtime.js";

export type EditorRemoteApplyStatus = "applied" | "skipped" | "failed";

export type EditorRemoteApplyIssue = {
  operationId: string;
  clientId: EditorClientId;
  path: string;
  message: string;
  severity?: "error" | "warning";
  error?: unknown;
};

export type EditorRemoteOperationDecoder<TRemoteOperation, TDocument, TSelection = unknown> = (
  envelope: EditorRemoteOperation<TRemoteOperation>,
) => EditorOperation<TDocument, TSelection>;

export type EditorRemoteApplyAdapter<TState, TRemoteOperation, TAppliedOperation> = {
  decode: (envelope: EditorRemoteOperation<TRemoteOperation>) => TAppliedOperation;
  apply: (
    state: TState,
    operation: TAppliedOperation,
    envelope: EditorRemoteOperation<TRemoteOperation>,
  ) => TState;
  getIssues?: (
    state: TState,
    operation: TAppliedOperation,
    envelope: EditorRemoteOperation<TRemoteOperation>,
  ) => readonly EditorRemoteApplyIssue[];
};

export type ApplyEditorRemoteOperationsOptions = DedupeEditorRemoteOperationsOptions & {
  markFailedAsSeen?: false;
};

export type ApplyEditorRemoteOperationsResult<TState, TSelection = unknown> = {
  state: TState;
  collaboration: EditorCollaborationState<TSelection>;
  applied: readonly EditorRemoteOperation[];
  skipped: readonly EditorRemoteOperation[];
  failed: readonly {
    operation: EditorRemoteOperation;
    error: unknown;
  }[];
  issues: readonly EditorRemoteApplyIssue[];
};

export type CreateEditorOperationRemoteApplyAdapterOptions<
  TRemoteOperation,
  TDocument,
  TSelection = unknown,
> = {
  decode: EditorRemoteOperationDecoder<TRemoteOperation, TDocument, TSelection>;
  origin?: (envelope: EditorRemoteOperation<TRemoteOperation>) => EditorChangeOrigin;
};

export type EditorOperationRemoteApplyAdapter<
  TDocument,
  TSelection = unknown,
  TRemoteOperation = unknown,
> = EditorRemoteApplyAdapter<
  EditorOperationRuntimeState<TDocument, TSelection>,
  TRemoteOperation,
  EditorOperation<TDocument, TSelection>
>;

export type EditorConflictResolution = "local" | "remote" | "merged";

export type ResolveEditorPersistenceConflictOptions<TDocument, TSelection = unknown> = {
  resolution: EditorConflictResolution;
  mergedDocument?: TDocument;
  selection?: EditorRuntimeSelection<TSelection>;
  now?: EditorPersistenceClock;
};

export type ResolveEditorPersistenceConflictResult<TDocument, TSelection = unknown> = {
  runtime: EditorRuntimeState<TDocument, TSelection>;
  persistence: EditorPersistenceState;
  resolution: EditorConflictResolution;
  document: TDocument;
};
