import type { EditorChangeOrigin } from "../aspects.js";
import {
  createEditorTransactionHistory,
  pushEditorTransactionHistory,
  redoEditorTransactionHistory,
  undoEditorTransactionHistory,
  type EditorTransaction,
  type EditorTransactionHistory,
} from "../history.js";
import {
  commitEditorRuntime,
  createEditorRuntime,
  type CommitEditorRuntimeOptions,
  type EditorRuntimeSelection,
  type EditorRuntimeState,
} from "../runtime.js";
import {
  countEditorTelemetryIssues,
  type EditorTelemetry,
  type EditorTelemetryEventMap,
} from "../telemetry.js";
import type {
  ApplyEditorInteractionOperationOptions,
  ApplyEditorOperationOptions,
  EditorOperation,
  EditorOperationPreflightIssue,
  EditorOperationRuntimeOptions,
  EditorOperationRuntimeState,
  ReplaceEditorOperationRuntimeCoreStateOptions,
} from "./types.js";

const operationRuntimeOptionsByState = new WeakMap<
  object,
  EditorOperationRuntimeOptions<unknown>
>();

export function createEditorOperationRuntime<TDocument, TSelection = unknown>(
  options: EditorOperationRuntimeOptions<TDocument, TSelection>,
): EditorOperationRuntimeState<TDocument, TSelection> {
  const runtime = createEditorRuntime({
    ...options,
    history: {
      ...options.history,
      limit: 0,
    },
  });

  return withOperationRuntimeFlags(
    {
      issues: [],
      lastMergeKey: null,
      operationHistory: createEditorTransactionHistory<TDocument, TSelection>(),
      runtime,
    },
    options,
  );
}

export function replaceEditorOperationRuntimeCoreState<TDocument, TSelection = unknown>(
  state: EditorOperationRuntimeState<TDocument, TSelection>,
  runtime: EditorRuntimeState<TDocument, TSelection>,
  options: ReplaceEditorOperationRuntimeCoreStateOptions = {},
): EditorOperationRuntimeState<TDocument, TSelection> {
  const runtimeOptions = getOperationRuntimeOptions(state);
  const operationHistory = options.clearOperationHistory
    ? createEditorTransactionHistory<TDocument, TSelection>()
    : state.operationHistory;

  return withOperationRuntimeFlags(
    {
      issues: options.clearIssues ? [] : state.issues,
      lastMergeKey: options.clearOperationHistory ? null : state.lastMergeKey,
      operationHistory,
      runtime,
    },
    runtimeOptions,
  );
}

export function applyEditorOperation<TDocument, TSelection = unknown>(
  state: EditorOperationRuntimeState<TDocument, TSelection>,
  operation: EditorOperation<TDocument, TSelection>,
  options: ApplyEditorOperationOptions = {},
): EditorOperationRuntimeState<TDocument, TSelection> {
  const runtimeOptions = getOperationRuntimeOptions(state);
  const { telemetry } = runtimeOptions;
  const startedAt = telemetry?.now();
  const report = (
    status: "applied" | "rejected" | "unchanged",
    next: EditorOperationRuntimeState<TDocument, TSelection>,
    merged = false,
  ) => {
    reportOperationApply(telemetry, startedAt, {
      ...countEditorTelemetryIssues(issues),
      merged,
      operationId: operation.id,
      revision: next.runtime.revision,
      status,
    });
    return next;
  };
  const issues = preflightEditorOperation(state, operation);
  if (issues.some((issue) => issue.severity !== "warning")) {
    return report(
      "rejected",
      withOperationRuntimeFlags(
        {
          ...state,
          issues,
        },
        runtimeOptions,
      ),
    );
  }

  const before = state.runtime.document;
  const selectionBefore =
    operation.selectionBefore ?? (state.runtime.selection as TSelection | undefined);
  const after = operation.apply(before);
  const commitOptions: CommitEditorRuntimeOptions<TSelection> = {
    origin: operation.origin,
  };

  if (operation.selectionAfter !== undefined) {
    commitOptions.selection = operation.selectionAfter as EditorRuntimeSelection<TSelection>;
  }

  const runtime = commitEditorRuntime(state.runtime, after, commitOptions);
  const documentChanged = runtime.revision !== state.runtime.revision;
  const selectionChanged = runtime.selection !== state.runtime.selection;
  if (!documentChanged && !selectionChanged) {
    return report(
      "unchanged",
      withOperationRuntimeFlags(
        {
          ...state,
          issues,
          lastMergeKey: operation.mergeKey ?? null,
          runtime,
        },
        runtimeOptions,
      ),
    );
  }

  const transaction: EditorTransaction<TDocument, TSelection> = {
    after: runtime.document,
    before,
    id: operation.id,
    label: operation.label,
    mergeKey: operation.mergeKey,
    selectionAfter: operation.selectionAfter ?? (runtime.selection as TSelection | undefined),
    selectionBefore,
  };

  const recorded =
    options.recordHistory === false
      ? { history: state.operationHistory, merged: false }
      : pushOrMergeOperationTransaction(state, transaction, options);
  return report(
    "applied",
    withOperationRuntimeFlags(
      {
        issues,
        lastMergeKey: operation.mergeKey ?? null,
        operationHistory: recorded.history,
        runtime,
      },
      runtimeOptions,
    ),
    recorded.merged,
  );
}

export function applyEditorInteractionOperation<TDocument, TSelection = unknown>(
  state: EditorOperationRuntimeState<TDocument, TSelection>,
  operation: EditorOperation<TDocument, TSelection>,
  options: ApplyEditorInteractionOperationOptions = {},
): EditorOperationRuntimeState<TDocument, TSelection> {
  return applyEditorOperation(state, withOperationOrigin(operation, options.origin), {
    merge: true,
  });
}

export function undoEditorOperationRuntime<TDocument, TSelection = unknown>(
  state: EditorOperationRuntimeState<TDocument, TSelection>,
  options: { origin?: EditorChangeOrigin } = {},
): EditorOperationRuntimeState<TDocument, TSelection> {
  const runtimeOptions = getOperationRuntimeOptions(state);
  const undone = undoEditorTransactionHistory(
    state.operationHistory,
    state.runtime.selection as TSelection | undefined,
  );
  if (undone.document === undefined) {
    runtimeOptions.telemetry?.emit("operation.undo", {
      revision: state.runtime.revision,
      status: "empty",
    });
    return withOperationRuntimeFlags(state, runtimeOptions);
  }

  const next = withOperationRuntimeFlags(
    {
      issues: [],
      lastMergeKey: null,
      operationHistory: undone.history,
      runtime: commitEditorRuntime(state.runtime, undone.document, {
        origin: options.origin,
        selection: undone.selection as EditorRuntimeSelection<TSelection>,
      }),
    },
    runtimeOptions,
  );
  runtimeOptions.telemetry?.emit("operation.undo", {
    revision: next.runtime.revision,
    status: "applied",
  });
  return next;
}

export function redoEditorOperationRuntime<TDocument, TSelection = unknown>(
  state: EditorOperationRuntimeState<TDocument, TSelection>,
  options: { origin?: EditorChangeOrigin } = {},
): EditorOperationRuntimeState<TDocument, TSelection> {
  const runtimeOptions = getOperationRuntimeOptions(state);
  const redone = redoEditorTransactionHistory(
    state.operationHistory,
    state.runtime.selection as TSelection | undefined,
  );
  if (redone.document === undefined) {
    runtimeOptions.telemetry?.emit("operation.redo", {
      revision: state.runtime.revision,
      status: "empty",
    });
    return withOperationRuntimeFlags(state, runtimeOptions);
  }

  const next = withOperationRuntimeFlags(
    {
      issues: [],
      lastMergeKey: null,
      operationHistory: redone.history,
      runtime: commitEditorRuntime(state.runtime, redone.document, {
        origin: options.origin,
        selection: redone.selection as EditorRuntimeSelection<TSelection>,
      }),
    },
    runtimeOptions,
  );
  runtimeOptions.telemetry?.emit("operation.redo", {
    revision: next.runtime.revision,
    status: "applied",
  });
  return next;
}

function withOperationOrigin<TDocument, TSelection>(
  operation: EditorOperation<TDocument, TSelection>,
  origin: EditorChangeOrigin | undefined,
): EditorOperation<TDocument, TSelection> {
  return origin === undefined ? operation : { ...operation, origin };
}

function pushOrMergeOperationTransaction<TDocument, TSelection>(
  state: EditorOperationRuntimeState<TDocument, TSelection>,
  transaction: EditorTransaction<TDocument, TSelection>,
  options: ApplyEditorOperationOptions,
): { history: EditorTransactionHistory<TDocument, TSelection>; merged: boolean } {
  const shouldMerge =
    options.merge !== false &&
    Boolean(transaction.mergeKey) &&
    transaction.mergeKey === state.lastMergeKey;
  const lastTransaction = state.operationHistory.undoStack.at(-1);

  if (
    shouldMerge &&
    lastTransaction !== undefined &&
    lastTransaction.mergeKey === transaction.mergeKey
  ) {
    const mergedTransaction: EditorTransaction<TDocument, TSelection> = {
      after: transaction.after,
      before: lastTransaction.before,
      id: lastTransaction.id,
      label: transaction.label ?? lastTransaction.label,
      mergeKey: lastTransaction.mergeKey,
      selectionAfter: transaction.selectionAfter,
      selectionBefore: lastTransaction.selectionBefore,
    };
    const undoStack = state.operationHistory.undoStack.slice(0, -1);
    undoStack.push(mergedTransaction);
    return {
      history: {
        redoStack: [],
        undoStack,
      },
      merged: true,
    };
  }

  const limit = Math.max(
    0,
    Math.trunc(getOperationRuntimeOptions(state).operationHistoryLimit ?? 100),
  );
  return {
    history: pushEditorTransactionHistory(state.operationHistory, transaction, { limit }),
    merged: false,
  };
}

function reportOperationApply(
  telemetry: EditorTelemetry | undefined,
  startedAt: number | undefined,
  attributes: EditorTelemetryEventMap["operation.apply"],
): void {
  if (telemetry && startedAt !== undefined) {
    telemetry.emit("operation.apply", attributes, { durationMs: telemetry.now() - startedAt });
  }
}

function preflightEditorOperation<TDocument, TSelection>(
  state: EditorOperationRuntimeState<TDocument, TSelection>,
  operation: EditorOperation<TDocument, TSelection>,
): readonly EditorOperationPreflightIssue[] {
  const options = getOperationRuntimeOptions(state);
  return (
    options.preflight?.({ document: state.runtime.document, operation, runtime: state.runtime }) ??
    []
  );
}

function withOperationRuntimeFlags<TDocument, TSelection>(
  state: Omit<EditorOperationRuntimeState<TDocument, TSelection>, "canRedo" | "canUndo">,
  options: EditorOperationRuntimeOptions<TDocument, TSelection>,
): EditorOperationRuntimeState<TDocument, TSelection> {
  const runtime = {
    ...state,
    canRedo: state.operationHistory.redoStack.length > 0,
    canUndo: state.operationHistory.undoStack.length > 0,
  } as EditorOperationRuntimeState<TDocument, TSelection>;
  operationRuntimeOptionsByState.set(runtime, options as EditorOperationRuntimeOptions<unknown>);
  return runtime;
}

function getOperationRuntimeOptions<TDocument, TSelection>(
  state: EditorOperationRuntimeState<TDocument, TSelection>,
): EditorOperationRuntimeOptions<TDocument, TSelection> {
  const options = operationRuntimeOptionsByState.get(state);
  if (!options) {
    throw new Error(
      "Editor operation runtime state must be created by createEditorOperationRuntime.",
    );
  }
  return options as EditorOperationRuntimeOptions<TDocument, TSelection>;
}
