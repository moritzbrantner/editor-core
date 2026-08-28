import type { EditorChangeOrigin } from "../aspects.js";
import type { EditorHotkeyMap } from "../hotkeys.js";
import type { EditorTransactionHistory } from "../history.js";
import type { EditorRuntimeOptions, EditorRuntimeState } from "../runtime.js";
import type { EditorParseIssue } from "../serialization.js";

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
  readonly document: TDocument;
  readonly operation: EditorOperation<TDocument, TSelection>;
  readonly runtime: EditorRuntimeState<TDocument, TSelection>;
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

declare class EditorOperationRuntimeStateIdentity {
  private readonly __editorOperationRuntimeStateIdentity: void;
}

/**
 * Opaque Operation Runtime state created and changed through Operation Runtime transitions.
 *
 * Do not construct, copy with object spread, or deserialize this state. Its identity owns
 * operation preflight, transaction merging, and history-limit policy.
 */
export type EditorOperationRuntimeState<
  TDocument,
  TSelection = unknown,
> = EditorOperationRuntimeStateIdentity & {
  readonly runtime: EditorRuntimeState<TDocument, TSelection>;
  readonly operationHistory: EditorTransactionHistory<TDocument, TSelection>;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly lastMergeKey: string | null;
  readonly issues: readonly EditorOperationPreflightIssue[];
};

export type ApplyEditorOperationOptions = {
  merge?: boolean;
};

export type ApplyEditorInteractionOperationOptions = {
  origin?: EditorChangeOrigin;
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
