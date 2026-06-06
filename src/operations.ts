import type { EditorChangeOrigin } from "./aspects.js";
import type { EditorCommandDefinition, EditorHotkeyMap } from "./hotkeys.js";
import {
  createEditorTransactionHistory,
  redoEditorTransactionHistory,
  undoEditorTransactionHistory,
  type EditorTransaction,
  type EditorTransactionHistory,
} from "./history.js";
import {
  commitEditorRuntime,
  createEditorRuntime,
  type CommitEditorRuntimeOptions,
  type EditorRuntimeOptions,
  type EditorRuntimeSelection,
  type EditorRuntimeState,
} from "./runtime.js";
import {
  EditorJsonParseError,
  EditorMigrationError,
  type EditorParseIssue,
} from "./serialization.js";
import { isEditorRecord } from "./json.js";

export type EditorOperation<TDocument, TSelection = unknown> = {
  id: string;
  label?: string;
  apply: (document: TDocument) => TDocument;
  invert?: (document: TDocument) => TDocument;
  selectionBefore?: TSelection;
  selectionAfter?: TSelection;
  origin?: EditorChangeOrigin;
  mergeKey?: string;
  metadata?: Record<string, unknown>;
};

export type EditorOperationPreflightContext<TDocument, TSelection = unknown> = {
  document: TDocument;
  operation: EditorOperation<TDocument, TSelection>;
  runtime: EditorRuntimeState<TDocument, TSelection>;
};

export type EditorOperationPreflightIssue = {
  path: string;
  message: string;
  severity?: "error" | "warning";
};

export type EditorOperationRuntimeOptions<TDocument, TSelection = unknown> = EditorRuntimeOptions<
  TDocument,
  TSelection
> & {
  operationHistoryLimit?: number;
  preflight?: (
    context: EditorOperationPreflightContext<TDocument, TSelection>,
  ) => readonly EditorOperationPreflightIssue[];
};

export type EditorOperationRuntimeState<TDocument, TSelection = unknown> = {
  runtime: EditorRuntimeState<TDocument, TSelection>;
  operationHistory: EditorTransactionHistory<TDocument, TSelection>;
  canUndo: boolean;
  canRedo: boolean;
  lastMergeKey: string | null;
  issues: readonly EditorOperationPreflightIssue[];
};

export type ApplyEditorOperationOptions = {
  merge?: boolean;
};

export type SerializedEditorOperation<
  TPayload = unknown,
  TType extends string = string,
  TVersion extends number | string = number,
> = {
  id: string;
  type: TType;
  schemaVersion: TVersion;
  payload: TPayload;
  label?: string;
  origin?: EditorChangeOrigin;
  mergeKey?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

export type SerializedEditorOperationLog<
  TPayload = unknown,
  TFormat extends string = string,
  TVersion extends number | string = number,
> = {
  format: TFormat;
  schemaVersion: TVersion;
  operations: readonly SerializedEditorOperation<TPayload>[];
  exportedAt?: string;
  metadata?: Record<string, unknown>;
};

export type EditorOperationLogAdapter<TOperation> = {
  format: string;
  schemaVersion: number | string;
  read: (input: unknown, path?: string) => TOperation;
  normalize?: (operation: TOperation) => TOperation;
  validate?: (operation: TOperation) => readonly EditorParseIssue[];
};

export type EditorOperationLogMigration<TOperation> = (
  input: SerializedEditorOperationLog<unknown>,
  adapter: EditorOperationLogAdapter<TOperation>,
) => SerializedEditorOperationLog<unknown> | unknown;

export type EditorOperationLogMigrations<TOperation> = Record<
  string | number,
  EditorOperationLogMigration<TOperation>
>;

export type ReadEditorOperationLogOptions<TOperation> = {
  migrations?: EditorOperationLogMigrations<TOperation>;
  path?: string;
};

export type EditorOperationRuntimeCommandId = "undo" | "redo";

export const defaultEditorOperationRuntimeCommandHotkeys: EditorHotkeyMap<EditorOperationRuntimeCommandId> =
  {
    redo: ["Mod+Shift+Z"],
    undo: ["Mod+Z"],
  };

export const defaultEditorOperationRuntimeCommandLabels: Record<
  EditorOperationRuntimeCommandId,
  string
> = {
  redo: "Redo",
  undo: "Undo",
};

export type EditorOperationRuntimeCommandsOptions<TDocument, TSelection = unknown> = {
  editor: EditorOperationRuntimeState<TDocument, TSelection>;
  setEditor: (
    updater: (
      editor: EditorOperationRuntimeState<TDocument, TSelection>,
    ) => EditorOperationRuntimeState<TDocument, TSelection>,
  ) => void;
  hotkeys?: Partial<EditorHotkeyMap<EditorOperationRuntimeCommandId>>;
  labels?: Partial<Record<EditorOperationRuntimeCommandId, string>>;
  disabled?: Partial<Record<EditorOperationRuntimeCommandId, boolean>>;
};

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

export function createEditorOperationRuntimeCommands<TDocument, TSelection = unknown>(
  options: EditorOperationRuntimeCommandsOptions<TDocument, TSelection>,
): readonly EditorCommandDefinition<EditorOperationRuntimeCommandId>[] {
  return (["undo", "redo"] as const).map((id) => {
    const disabled = isEditorOperationRuntimeCommandDisabled(id, options);
    return {
      disabled,
      hotkeys: options.hotkeys?.[id] ?? defaultEditorOperationRuntimeCommandHotkeys[id],
      id,
      label: options.labels?.[id] ?? defaultEditorOperationRuntimeCommandLabels[id],
      run: () => {
        if (disabled) {
          return;
        }

        options.setEditor(id === "undo" ? undoEditorOperationRuntime : redoEditorOperationRuntime);
      },
    };
  });
}

export function serializeEditorOperationLog<
  TPayload,
  TFormat extends string,
  TVersion extends number | string,
>(
  operations: readonly SerializedEditorOperation<TPayload>[],
  options: {
    format: TFormat;
    schemaVersion: TVersion;
    exportedAt?: string | Date | false;
    metadata?: Record<string, unknown>;
  },
): SerializedEditorOperationLog<TPayload, TFormat, TVersion> {
  const log: SerializedEditorOperationLog<TPayload, TFormat, TVersion> = {
    format: options.format,
    operations: [...operations],
    schemaVersion: options.schemaVersion,
  };

  if (options.exportedAt !== false) {
    log.exportedAt =
      options.exportedAt instanceof Date
        ? options.exportedAt.toISOString()
        : (options.exportedAt ?? new Date().toISOString());
  }

  if (options.metadata) {
    log.metadata = options.metadata;
  }

  return log;
}

export function readEditorOperationLog<TOperation>(
  input: unknown,
  adapter: EditorOperationLogAdapter<TOperation>,
  options: ReadEditorOperationLogOptions<TOperation> = {},
): readonly TOperation[] {
  const migrated = migrateEditorOperationLog(input, adapter, options.migrations);
  const path = options.path ?? "";

  if (!isEditorRecord(migrated) || !isSerializedOperationLog(migrated, adapter.format)) {
    throw new EditorJsonParseError([{ path, message: "Expected operation log envelope." }]);
  }

  const operations = Array.isArray(migrated.operations) ? migrated.operations : null;
  if (!operations) {
    throw new EditorJsonParseError([
      { path: joinOperationLogPath(path, "operations"), message: "Expected operations array." },
    ]);
  }

  const readOperations: TOperation[] = [];
  const issues: EditorParseIssue[] = [];
  for (const [index, operationInput] of operations.entries()) {
    const operationPath = `${joinOperationLogPath(path, "operations")}.${index}`;
    try {
      const operation = normalizeEditorOperationLogOperation(
        adapter.read(operationInput, operationPath),
        adapter,
      );
      const operationIssues = adapter.validate?.(operation) ?? [];
      if (operationIssues.length > 0) {
        issues.push(...operationIssues);
      }
      readOperations.push(operation);
    } catch (error) {
      if (error instanceof EditorJsonParseError) {
        issues.push(...error.issues);
      } else {
        throw error;
      }
    }
  }

  if (issues.length > 0) {
    throw new EditorJsonParseError(issues);
  }

  return readOperations;
}

export function migrateEditorOperationLog<TOperation>(
  input: unknown,
  adapter: EditorOperationLogAdapter<TOperation>,
  migrations: EditorOperationLogMigrations<TOperation> = {},
  seenVersions: ReadonlySet<string> = new Set(),
): unknown {
  if (!isEditorRecord(input) || !isSerializedOperationLog(input, adapter.format)) {
    return input;
  }

  if (input.schemaVersion === adapter.schemaVersion) {
    return input;
  }

  const versionKey = String(input.schemaVersion);
  if (seenVersions.has(versionKey)) {
    throw new EditorMigrationError(
      `Migration cycle detected for ${adapter.format} operation log schema version ${versionKey}.`,
    );
  }

  const migration = migrations[versionKey];
  if (!migration) {
    throw new EditorMigrationError(
      `Unsupported ${adapter.format} operation log schema version ${String(input.schemaVersion)}.`,
    );
  }

  const migrated = migration(input as SerializedEditorOperationLog<unknown>, adapter);
  return migrateEditorOperationLog(
    migrated,
    adapter,
    migrations,
    new Set([...seenVersions, versionKey]),
  );
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

function isEditorOperationRuntimeCommandDisabled<TDocument, TSelection>(
  id: EditorOperationRuntimeCommandId,
  options: EditorOperationRuntimeCommandsOptions<TDocument, TSelection>,
): boolean {
  if (options.disabled?.[id]) {
    return true;
  }

  return id === "undo" ? !options.editor.canUndo : !options.editor.canRedo;
}

function normalizeEditorOperationLogOperation<TOperation>(
  operation: TOperation,
  adapter: EditorOperationLogAdapter<TOperation>,
): TOperation {
  return adapter.normalize ? adapter.normalize(operation) : operation;
}

function isSerializedOperationLog(input: Record<string, unknown>, format: string): boolean {
  return input.format === format && "schemaVersion" in input && "operations" in input;
}

function joinOperationLogPath(root: string, segment: string): string {
  return root ? `${root}.${segment}` : segment;
}

const operationRuntimeOptionsByState = new WeakMap<
  object,
  EditorOperationRuntimeOptions<unknown>
>();

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
