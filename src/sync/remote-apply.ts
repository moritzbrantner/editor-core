import {
  hasSeenEditorRemoteOperation,
  markEditorRemoteOperationSeen,
  type EditorCollaborationState,
  type EditorRemoteOperation,
} from "../collaboration.js";
import {
  applyEditorOperation,
  type EditorOperation,
  type EditorOperationRuntimeState,
} from "../operations.js";
import type {
  ApplyEditorRemoteOperationsOptions,
  ApplyEditorRemoteOperationsResult,
  CreateEditorOperationRemoteApplyAdapterOptions,
  EditorOperationRemoteApplyAdapter,
  EditorRemoteApplyAdapter,
  EditorRemoteApplyIssue,
} from "./types.js";

export function applyEditorRemoteOperations<
  TState,
  TRemoteOperation,
  TAppliedOperation,
  TSelection = unknown,
>(
  state: TState,
  collaboration: EditorCollaborationState<TSelection>,
  operations: readonly EditorRemoteOperation<TRemoteOperation>[],
  adapter: EditorRemoteApplyAdapter<TState, TRemoteOperation, TAppliedOperation>,
  options: ApplyEditorRemoteOperationsOptions = {},
): ApplyEditorRemoteOperationsResult<TState, TSelection> {
  let nextState = state;
  let nextCollaboration = collaboration;
  const applied: EditorRemoteOperation[] = [];
  const skipped: EditorRemoteOperation[] = [];
  const failed: { operation: EditorRemoteOperation; error: unknown }[] = [];
  const issues: EditorRemoteApplyIssue[] = [];
  const queuedOperationIds = new Set<string>();

  for (const operation of operations) {
    if (!options.includeLocalClient && operation.clientId === collaboration.clientId) {
      nextCollaboration = markEditorRemoteOperationSeen(nextCollaboration, operation.id, options);
      skipped.push(operation);
      continue;
    }

    if (
      hasSeenEditorRemoteOperation(nextCollaboration, operation.id) ||
      queuedOperationIds.has(operation.id)
    ) {
      skipped.push(operation);
      continue;
    }

    queuedOperationIds.add(operation.id);
    try {
      const decoded = adapter.decode(operation);
      nextState = adapter.apply(nextState, decoded, operation);
      issues.push(...(adapter.getIssues?.(nextState, decoded, operation) ?? []));
      nextCollaboration = markEditorRemoteOperationSeen(nextCollaboration, operation.id, options);
      applied.push(operation);
    } catch (error) {
      failed.push({ error, operation });
      issues.push(normalizeRemoteApplyError(operation, error));
    }
  }

  return {
    applied,
    collaboration: nextCollaboration,
    failed,
    issues,
    skipped,
    state: nextState,
  };
}

export function createEditorOperationRemoteApplyAdapter<
  TDocument,
  TSelection = unknown,
  TRemoteOperation = unknown,
>(
  options: CreateEditorOperationRemoteApplyAdapterOptions<TRemoteOperation, TDocument, TSelection>,
): EditorOperationRemoteApplyAdapter<TDocument, TSelection, TRemoteOperation> {
  return {
    apply(state, operation, envelope) {
      const operationWithOrigin = withRemoteOperationOrigin(operation, envelope, options);
      const nextState = applyEditorOperation(state, operationWithOrigin, { merge: false });

      if (nextState.issues.some((issue) => issue.severity !== "warning")) {
        throw new EditorRemoteOperationPreflightError(nextState.issues);
      }

      return restoreRemoteOperationRuntimeState(state, nextState);
    },
    decode: options.decode,
    getIssues(state, _operation, envelope) {
      return state.issues.map((issue) => ({
        clientId: envelope.clientId,
        message: issue.message,
        operationId: envelope.id,
        path: issue.path,
        severity: issue.severity,
      }));
    },
  };
}

class EditorRemoteOperationPreflightError extends Error {
  readonly issues: readonly { path: string; message: string; severity?: "error" | "warning" }[];

  constructor(
    issues: readonly { path: string; message: string; severity?: "error" | "warning" }[],
  ) {
    super("Remote editor operation failed preflight.");
    this.name = "EditorRemoteOperationPreflightError";
    this.issues = issues;
  }
}

function withRemoteOperationOrigin<TDocument, TSelection, TRemoteOperation>(
  operation: EditorOperation<TDocument, TSelection>,
  envelope: EditorRemoteOperation<TRemoteOperation>,
  options: CreateEditorOperationRemoteApplyAdapterOptions<TRemoteOperation, TDocument, TSelection>,
): EditorOperation<TDocument, TSelection> {
  return {
    ...operation,
    origin: operation.origin ??
      options.origin?.(envelope) ?? {
        actorId: envelope.actorId,
        clientId: envelope.clientId,
        source: "remote-operation",
      },
  };
}

function restoreRemoteOperationRuntimeState<TDocument, TSelection>(
  previous: EditorOperationRuntimeState<TDocument, TSelection>,
  next: EditorOperationRuntimeState<TDocument, TSelection>,
): EditorOperationRuntimeState<TDocument, TSelection> {
  return Object.assign(next, {
    canRedo: previous.canRedo,
    canUndo: previous.canUndo,
    lastMergeKey: null,
    operationHistory: previous.operationHistory,
  });
}

function normalizeRemoteApplyError(
  operation: EditorRemoteOperation,
  error: unknown,
): EditorRemoteApplyIssue {
  const preflightIssues = getPreflightIssues(error);
  const firstIssue = preflightIssues[0];
  return {
    clientId: operation.clientId,
    error,
    message: firstIssue?.message ?? getErrorMessage(error),
    operationId: operation.id,
    path: firstIssue?.path ?? "",
    severity: firstIssue?.severity ?? "error",
  };
}

function getPreflightIssues(
  error: unknown,
): readonly { path: string; message: string; severity?: "error" | "warning" }[] {
  if (
    error &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray((error as { issues: unknown }).issues)
  ) {
    return (
      error as {
        issues: readonly { path: string; message: string; severity?: "error" | "warning" }[];
      }
    ).issues;
  }

  return [];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Remote editor operation failed.";
}
