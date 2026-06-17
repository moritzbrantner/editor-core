import type { EditorChangeOrigin } from "../aspects.js";
import {
  createEditorTransactionHistory,
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
} from "../runtime.js";
import type {
  ApplyEditorOperationOptions,
  ApplyEditorOperationModeOptions,
  EditorOperation,
  EditorOperationPreflightIssue,
  EditorOperationRuntimeOptions,
  EditorOperationRuntimeState,
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

export function applyEditorOperation<TDocument, TSelection = unknown>(
  state: EditorOperationRuntimeState<TDocument, TSelection>,
  operation: EditorOperation<TDocument, TSelection>,
  options: ApplyEditorOperationOptions = {},
): EditorOperationRuntimeState<TDocument, TSelection> {
  const runtimeOptions = getOperationRuntimeOptions(state);
  const issues = preflightEditorOperation(state, operation);
  if (issues.some((issue) => issue.severity !== "warning")) {
    return withOperationRuntimeFlags(
      {
        ...state,
        issues,
      },
      runtimeOptions,
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
    return withOperationRuntimeFlags(
      {
        ...state,
        issues,
        lastMergeKey: operation.mergeKey ?? null,
        runtime,
      },
      runtimeOptions,
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

  return withOperationRuntimeFlags(
    {
      issues,
      lastMergeKey: operation.mergeKey ?? null,
      operationHistory: pushOrMergeOperationTransaction(state, transaction, options),
      runtime,
    },
    runtimeOptions,
  );
}

export function applyEditorInteractionOperation<TDocument, TSelection = unknown>(
  state: EditorOperationRuntimeState<TDocument, TSelection>,
  operation: EditorOperation<TDocument, TSelection>,
  options: ApplyEditorOperationModeOptions = {},
): EditorOperationRuntimeState<TDocument, TSelection> {
  return applyEditorOperation(state, withOperationModeOrigin(operation, options), { merge: true });
}

export function applyEditorRemoteOperation<TDocument, TSelection = unknown>(
  state: EditorOperationRuntimeState<TDocument, TSelection>,
  operation: EditorOperation<TDocument, TSelection>,
  options: ApplyEditorOperationModeOptions = {},
): EditorOperationRuntimeState<TDocument, TSelection> {
  const nextState = applyEditorOperation(state, withOperationModeOrigin(operation, options), {
    merge: false,
  });

  if (nextState.issues.some((issue) => issue.severity !== "warning")) {
    return nextState;
  }

  return withOperationRuntimeFlags(
    {
      ...nextState,
      lastMergeKey: null,
      operationHistory: state.operationHistory,
    },
    getOperationRuntimeOptions(state),
  );
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
    return withOperationRuntimeFlags(state, runtimeOptions);
  }

  return withOperationRuntimeFlags(
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
    return withOperationRuntimeFlags(state, runtimeOptions);
  }

  return withOperationRuntimeFlags(
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
}

function withOperationModeOrigin<TDocument, TSelection>(
  operation: EditorOperation<TDocument, TSelection>,
  options: ApplyEditorOperationModeOptions,
): EditorOperation<TDocument, TSelection> {
  if (options.origin === undefined) {
    return operation;
  }

  return {
    ...operation,
    origin: options.origin,
  };
}

function pushOrMergeOperationTransaction<TDocument, TSelection>(
  state: EditorOperationRuntimeState<TDocument, TSelection>,
  transaction: EditorTransaction<TDocument, TSelection>,
  options: ApplyEditorOperationOptions,
): EditorTransactionHistory<TDocument, TSelection> {
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
    return {
      redoStack: [],
      undoStack: [...state.operationHistory.undoStack.slice(0, -1), mergedTransaction],
    };
  }

  const limit = Math.max(
    0,
    Math.trunc(getOperationRuntimeOptions(state).operationHistoryLimit ?? 100),
  );
  return {
    redoStack: [],
    undoStack: limit === 0 ? [] : [...state.operationHistory.undoStack, transaction].slice(-limit),
  };
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
  };
  operationRuntimeOptionsByState.set(runtime, options as EditorOperationRuntimeOptions<unknown>);
  return runtime;
}

function getOperationRuntimeOptions<TDocument, TSelection>(
  state: EditorOperationRuntimeState<TDocument, TSelection>,
): EditorOperationRuntimeOptions<TDocument, TSelection> {
  const options = operationRuntimeOptionsByState.get(state);
  return (options ?? {}) as EditorOperationRuntimeOptions<TDocument, TSelection>;
}
