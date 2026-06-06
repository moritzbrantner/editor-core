# API Report

Generated from the public declaration files in `dist`. Run `bun run api:update` after intentional API changes.

## aspects.d.ts

```ts
type EditorChangeOrigin = {
  actorId?: string;
  clientId?: string;
  source?: string;
  timestamp?: string;
  transactionId?: string;
  metadata?: Record<string, unknown>;
};
type EditorAspectContext<TDocument> = {
  document: TDocument;
  origin?: EditorChangeOrigin;
  revision: number;
};
/**
 * A derived value that can be recomputed from a document revision.
 *
 * Aspects are useful for cached editor metadata such as validation summaries, word counts, or
 * indexing state that should report whether it changed since the previous snapshot.
 */
type EditorAspectDefinition<TDocument, TValue> = {
  id: string;
  label?: string;
  derive: (context: EditorAspectContext<TDocument>) => TValue;
  equals?(left: TValue, right: TValue): boolean;
};
type EditorResolvedAspect<TValue> = {
  id: string;
  label?: string;
  value: TValue;
  changed: boolean;
};
type ResolveEditorAspectsOptions<TDocument> = {
  origin?: EditorChangeOrigin;
  previous?: EditorAspectSnapshot<TDocument>;
  revision?: number;
};
type EditorAspectSnapshot<TDocument> = {
  document: TDocument;
  origin?: EditorChangeOrigin;
  revision: number;
  aspects: Record<string, EditorResolvedAspect<unknown>>;
};
declare function createEditorAspect<TDocument, TValue>(
  definition: EditorAspectDefinition<TDocument, TValue>,
): EditorAspectDefinition<TDocument, TValue>;
declare function resolveEditorAspects<TDocument>(
  document: TDocument,
  definitions: readonly EditorAspectDefinition<TDocument, unknown>[],
  options?: ResolveEditorAspectsOptions<TDocument>,
): EditorAspectSnapshot<TDocument>;
declare function getEditorResolvedAspect<TValue>(
  snapshot: EditorAspectSnapshot<unknown>,
  id: string,
): EditorResolvedAspect<TValue> | null;

export {
  type EditorAspectContext,
  type EditorAspectDefinition,
  type EditorAspectSnapshot,
  type EditorChangeOrigin,
  type EditorResolvedAspect,
  type ResolveEditorAspectsOptions,
  createEditorAspect,
  getEditorResolvedAspect,
  resolveEditorAspects,
};
```

## browser.d.ts

```ts
type DownloadEditorJsonOptions = {
  filename?: string;
  pretty?: boolean | number;
};
type ReadEditorJsonFileOptions<TValue> = {
  parse?: (input: unknown) => TValue;
};
type EditorBrowserErrorContext =
  | {
      operation: "clipboard-read";
    }
  | {
      key?: string;
      operation: "storage-load";
    }
  | {
      key?: string;
      operation: "storage-save";
    };
type EditorBrowserErrorHandler = (error: unknown, context: EditorBrowserErrorContext) => void;
type EditorStorageAdapter<TValue> = {
  load: () => TValue | null | Promise<TValue | null>;
  save: (value: TValue) => void | Promise<void>;
};
type LocalStorageEditorStorageOptions<TValue> = {
  key: string;
  storage?: Storage;
  parse?: (input: unknown) => TValue;
  serialize?: (value: TValue) => unknown;
  onError?: EditorBrowserErrorHandler;
};
type EditorClipboardFallback = {
  text?: string | null;
};
type EditorClipboardJsonOptions = {
  fallback?: EditorClipboardFallback;
  onError?: EditorBrowserErrorHandler;
};
type LoadEditorStorageOptions<TValue> = {
  normalize?: (value: TValue) => TValue;
  onError?: EditorBrowserErrorHandler;
};
type SaveEditorStorageOptions<TValue> = {
  normalize?: (value: TValue) => TValue;
  onError?: EditorBrowserErrorHandler;
};
declare function ensureEditorJsonFilename(filename: string): string;
declare function downloadEditorJson(value: unknown, options?: DownloadEditorJsonOptions): void;
declare function readEditorJsonFile<TValue = unknown>(
  file: Blob,
  options?: ReadEditorJsonFileOptions<TValue>,
): Promise<TValue>;
declare function createLocalStorageEditorStorage<TValue>(
  options: LocalStorageEditorStorageOptions<TValue>,
): EditorStorageAdapter<TValue>;
declare function loadEditorStorage<TValue>(
  storage: EditorStorageAdapter<TValue>,
  fallback: TValue,
  options?: LoadEditorStorageOptions<TValue>,
): Promise<TValue>;
declare function saveEditorStorage<TValue>(
  storage: EditorStorageAdapter<TValue>,
  value: TValue,
  options?: SaveEditorStorageOptions<TValue>,
): Promise<void>;
declare function writeEditorClipboardJson(
  payload: unknown,
  options?: EditorClipboardJsonOptions,
): Promise<boolean>;
declare function readEditorClipboardJson<TValue = unknown>(
  options?: EditorClipboardJsonOptions,
): Promise<TValue | null>;

export {
  type DownloadEditorJsonOptions,
  type EditorBrowserErrorContext,
  type EditorBrowserErrorHandler,
  type EditorClipboardFallback,
  type EditorClipboardJsonOptions,
  type EditorStorageAdapter,
  type LoadEditorStorageOptions,
  type LocalStorageEditorStorageOptions,
  type ReadEditorJsonFileOptions,
  type SaveEditorStorageOptions,
  createLocalStorageEditorStorage,
  downloadEditorJson,
  ensureEditorJsonFilename,
  loadEditorStorage,
  readEditorClipboardJson,
  readEditorJsonFile,
  saveEditorStorage,
  writeEditorClipboardJson,
};
```

## commands.d.ts

```ts
import { EditorSnapshotHistory, EditorSnapshotHistoryOptions } from "./history.js";
import { EditorCommandDefinition, EditorHotkeyEvent, EditorHotkeyMap } from "./hotkeys.js";

type EditorSnapshotHistoryCommandId = "undo" | "redo" | "reset";
type EditorCommandContext<TDocument, TSelection, TViewport = unknown> = {
  document: TDocument;
  selection: TSelection;
  viewport?: TViewport;
  readOnly?: boolean;
};
type EditorContextualCommandDefinition<
  TId extends string,
  TDocument,
  TSelection,
  TViewport = unknown,
> = Omit<EditorCommandDefinition<TId>, "disabled" | "run"> & {
  group?: string;
  menu?: {
    label?: string;
    order?: number;
  };
  canRun?: (context: EditorCommandContext<TDocument, TSelection, TViewport>) => boolean;
  checked?:
    | boolean
    | ((context: EditorCommandContext<TDocument, TSelection, TViewport>) => boolean);
  run?: (context: EditorCommandContext<TDocument, TSelection, TViewport>) => void | Promise<void>;
};
type EditorResolvedCommandDefinition<TId extends string> = EditorCommandDefinition<TId> & {
  group?: string;
  menu?: {
    label?: string;
    order?: number;
  };
  checked?: boolean;
};
declare const defaultEditorSnapshotHistoryCommandHotkeys: EditorHotkeyMap<EditorSnapshotHistoryCommandId>;
declare const defaultEditorSnapshotHistoryCommandLabels: Record<
  EditorSnapshotHistoryCommandId,
  string
>;
type EditorSnapshotHistoryCommandRunContext = {
  id: EditorSnapshotHistoryCommandId;
  event: EditorHotkeyEvent;
};
type EditorSnapshotHistoryCommandsOptions<TDocument> = {
  history: EditorSnapshotHistory<TDocument>;
  setHistory: (
    updater: (history: EditorSnapshotHistory<TDocument>) => EditorSnapshotHistory<TDocument>,
  ) => void;
  getResetDocument: () => TDocument;
  historyOptions?: EditorSnapshotHistoryOptions<TDocument>;
  hotkeys?: Partial<EditorHotkeyMap<EditorSnapshotHistoryCommandId>>;
  labels?: Partial<Record<EditorSnapshotHistoryCommandId, string>>;
  disabled?: Partial<Record<EditorSnapshotHistoryCommandId, boolean>>;
  include?: readonly EditorSnapshotHistoryCommandId[];
  onRun?: (context: EditorSnapshotHistoryCommandRunContext) => void | Promise<void>;
};
declare function createEditorSnapshotHistoryCommands<TDocument>(
  options: EditorSnapshotHistoryCommandsOptions<TDocument>,
): readonly EditorCommandDefinition<EditorSnapshotHistoryCommandId>[];
declare function resolveEditorCommands<
  TId extends string,
  TDocument,
  TSelection,
  TViewport = unknown,
>(
  commands: readonly EditorContextualCommandDefinition<TId, TDocument, TSelection, TViewport>[],
  context: EditorCommandContext<TDocument, TSelection, TViewport>,
): readonly EditorResolvedCommandDefinition<TId>[];
declare function getRunnableEditorCommands<TId extends string>(
  commands: readonly EditorResolvedCommandDefinition<TId>[],
): readonly EditorResolvedCommandDefinition<TId>[];

export {
  type EditorCommandContext,
  type EditorContextualCommandDefinition,
  type EditorResolvedCommandDefinition,
  type EditorSnapshotHistoryCommandId,
  type EditorSnapshotHistoryCommandRunContext,
  type EditorSnapshotHistoryCommandsOptions,
  createEditorSnapshotHistoryCommands,
  defaultEditorSnapshotHistoryCommandHotkeys,
  defaultEditorSnapshotHistoryCommandLabels,
  getRunnableEditorCommands,
  resolveEditorCommands,
};
```

## constraints.d.ts

```ts
import { EditorEntityId, EditorTimelineRange } from "./entities.js";
import { EditorParseIssue } from "./serialization.js";

type EditorConstraintIssueOptions = {
  entityId?: EditorEntityId;
  message: string;
  path?: string;
};
type EditorGraphConnection = {
  sourceId: EditorEntityId;
  sourcePortId?: string;
  targetId: EditorEntityId;
  targetPortId?: string;
};
type ValidateEditorGraphConnectionOptions = {
  allowSelfConnection?: boolean;
  canConnect?: (connection: EditorGraphConnection) => boolean;
  path?: string;
};
type ValidateEditorTimelineRangeOptions = {
  allowZeroDuration?: boolean;
  max?: number;
  min?: number;
  path?: string;
};
declare function createEditorConstraintIssue(
  options: EditorConstraintIssueOptions,
): EditorParseIssue;
declare function validateEditorEntityIssues<TEntity>(
  entities: readonly TEntity[],
  validate: (entity: TEntity) => readonly EditorParseIssue[],
): readonly EditorParseIssue[];
declare function validateEditorGraphConnection(
  connection: EditorGraphConnection,
  options?: ValidateEditorGraphConnectionOptions,
): readonly EditorParseIssue[];
declare function validateEditorTimelineRange(
  range: EditorTimelineRange,
  options?: ValidateEditorTimelineRangeOptions,
): readonly EditorParseIssue[];
declare function clampEditorTimelineRange(
  range: EditorTimelineRange,
  options?: Pick<ValidateEditorTimelineRangeOptions, "max" | "min">,
): EditorTimelineRange;

export {
  type EditorConstraintIssueOptions,
  type EditorGraphConnection,
  type ValidateEditorGraphConnectionOptions,
  type ValidateEditorTimelineRangeOptions,
  clampEditorTimelineRange,
  createEditorConstraintIssue,
  validateEditorEntityIssues,
  validateEditorGraphConnection,
  validateEditorTimelineRange,
};
```

## entities.d.ts

```ts
type EditorEntityId = string;
type EditorEntityBase = {
  id: EditorEntityId;
  type: string;
  parentId?: EditorEntityId | null;
  order?: string | number;
  metadata?: Record<string, unknown>;
};
type EditorEntityDocument<TEntity extends EditorEntityBase = EditorEntityBase> = {
  entities: Record<EditorEntityId, TEntity>;
  rootIds: readonly EditorEntityId[];
};
type EditorPoint = {
  x: number;
  y: number;
};
type EditorSize = {
  height: number;
  width: number;
};
type EditorBounds = EditorPoint & EditorSize;
type EditorEntityBoundsAdapter<TEntity extends EditorEntityBase = EditorEntityBase> = {
  getBounds: (entity: TEntity) => EditorBounds | null | undefined;
};
type EditorIdFactory = (prefix?: string) => EditorEntityId;
type EditorLayerAdapter<TEntity extends EditorEntityBase = EditorEntityBase> = {
  getBounds?: (entity: TEntity) => EditorBounds | null | undefined;
  getParentId?: (entity: TEntity) => EditorEntityId | null | undefined;
  getOrder?: (entity: TEntity) => string | number | undefined;
  isLocked?: (entity: TEntity) => boolean;
  isVisible?: (entity: TEntity) => boolean;
};
type EditorGraphPort = {
  id: string;
  label?: string;
  direction?: "input" | "output" | "bidirectional";
};
type EditorGraphEdge = {
  id: EditorEntityId;
  sourceId: EditorEntityId;
  targetId: EditorEntityId;
  sourcePortId?: string;
  targetPortId?: string;
  type?: string;
};
type EditorGraphAdapter<
  TDocument = unknown,
  TNode extends EditorEntityBase = EditorEntityBase,
  TEdge extends EditorGraphEdge = EditorGraphEdge,
> = {
  getNodes: (document: TDocument) => readonly TNode[];
  getEdges: (document: TDocument) => readonly TEdge[];
  getPorts?: (node: TNode) => readonly EditorGraphPort[];
  canConnect?: (connection: {
    sourceId: EditorEntityId;
    sourcePortId?: string;
    targetId: EditorEntityId;
    targetPortId?: string;
  }) => boolean;
};
type EditorWorkflowAdapter<
  TDocument = unknown,
  TNode extends EditorEntityBase = EditorEntityBase,
  TTransition extends EditorGraphEdge = EditorGraphEdge,
> = EditorGraphAdapter<TDocument, TNode, TTransition> & {
  isStartNode?: (node: TNode) => boolean;
  isEndNode?: (node: TNode) => boolean;
};
type EditorTimelineRange = {
  start: number;
  end: number;
};
type EditorTimelineTrack<TEntity extends EditorEntityBase = EditorEntityBase> = TEntity;
type EditorTimelineItem<TEntity extends EditorEntityBase = EditorEntityBase> = TEntity & {
  trackId: EditorEntityId;
  range: EditorTimelineRange;
};
type EditorTimelineAdapter<
  TDocument = unknown,
  TTrack extends EditorEntityBase = EditorTimelineTrack,
  TItem extends EditorTimelineItem = EditorTimelineItem,
> = {
  getTracks: (document: TDocument) => readonly TTrack[];
  getItems: (document: TDocument) => readonly TItem[];
  getPlayhead?: (document: TDocument) => number;
  snapTime?: (time: number) => number;
};
declare function createEditorEntityDocument<TEntity extends EditorEntityBase>(
  entities: readonly TEntity[],
  rootIds?: readonly EditorEntityId[],
): EditorEntityDocument<TEntity>;
declare function getEditorEntity<TEntity extends EditorEntityBase>(
  document: EditorEntityDocument<TEntity>,
  id: EditorEntityId,
): TEntity | null;
declare function isEditorEntityId(id: unknown): id is EditorEntityId;
declare function createIncrementingEditorIdFactory(options?: { prefix?: string }): EditorIdFactory;

export {
  type EditorBounds,
  type EditorEntityBase,
  type EditorEntityBoundsAdapter,
  type EditorEntityDocument,
  type EditorEntityId,
  type EditorGraphAdapter,
  type EditorGraphEdge,
  type EditorGraphPort,
  type EditorIdFactory,
  type EditorLayerAdapter,
  type EditorPoint,
  type EditorSize,
  type EditorTimelineAdapter,
  type EditorTimelineItem,
  type EditorTimelineRange,
  type EditorTimelineTrack,
  type EditorWorkflowAdapter,
  createEditorEntityDocument,
  createIncrementingEditorIdFactory,
  getEditorEntity,
  isEditorEntityId,
};
```

## history.d.ts

```ts
declare const defaultEditorHistoryLimit = 100;
type EditorSnapshotHistory<TDocument> = {
  past: TDocument[];
  present: TDocument;
  future: TDocument[];
  canUndo: boolean;
  canRedo: boolean;
};
/**
 * Options for whole-document snapshot history.
 *
 * Use `normalize` to canonicalize documents before storage, `equals` to skip equivalent commits,
 * and `limit` to bound the number of undo snapshots retained.
 */
type EditorSnapshotHistoryOptions<TDocument> = {
  limit?: number;
  normalize?: (document: TDocument) => TDocument;
  equals?: (left: TDocument, right: TDocument) => boolean;
};
declare function createEditorSnapshotHistory<TDocument>(
  document: TDocument,
  options?: EditorSnapshotHistoryOptions<TDocument>,
): EditorSnapshotHistory<TDocument>;
declare function commitEditorSnapshotHistory<TDocument>(
  history: EditorSnapshotHistory<TDocument>,
  document: TDocument,
  options?: EditorSnapshotHistoryOptions<TDocument>,
): EditorSnapshotHistory<TDocument>;
declare function undoEditorSnapshotHistory<TDocument>(
  history: EditorSnapshotHistory<TDocument>,
): EditorSnapshotHistory<TDocument>;
declare function redoEditorSnapshotHistory<TDocument>(
  history: EditorSnapshotHistory<TDocument>,
): EditorSnapshotHistory<TDocument>;
declare function resetEditorSnapshotHistory<TDocument>(
  document: TDocument,
  options?: EditorSnapshotHistoryOptions<TDocument>,
): EditorSnapshotHistory<TDocument>;
declare function canUndoEditorHistory<TDocument>(
  history: EditorSnapshotHistory<TDocument>,
): boolean;
declare function canRedoEditorHistory<TDocument>(
  history: EditorSnapshotHistory<TDocument>,
): boolean;
type EditorTransaction<TDocument, TSelection = unknown> = {
  id: string;
  label?: string;
  mergeKey?: string;
  before: TDocument;
  after: TDocument;
  selectionBefore?: TSelection;
  selectionAfter?: TSelection;
};
/**
 * Undo/redo stacks for semantic editor transactions.
 *
 * Transaction history is useful when each operation has explicit before/after document state,
 * optional selection restoration, and an id or label that can be exposed in UI.
 */
type EditorTransactionHistory<TDocument, TSelection = unknown> = {
  undoStack: Array<EditorTransaction<TDocument, TSelection>>;
  redoStack: Array<EditorTransaction<TDocument, TSelection>>;
};
type EditorTransactionHistoryResult<TDocument, TSelection = unknown> = {
  history: EditorTransactionHistory<TDocument, TSelection>;
  document?: TDocument;
  selection?: TSelection;
  transaction?: EditorTransaction<TDocument, TSelection>;
};
declare function createEditorTransactionHistory<
  TDocument,
  TSelection = unknown,
>(): EditorTransactionHistory<TDocument, TSelection>;
declare function pushEditorTransactionHistory<TDocument, TSelection = unknown>(
  history: EditorTransactionHistory<TDocument, TSelection>,
  transaction: EditorTransaction<TDocument, TSelection>,
  options?: {
    limit?: number;
  },
): EditorTransactionHistory<TDocument, TSelection>;
declare function undoEditorTransactionHistory<TDocument, TSelection = unknown>(
  history: EditorTransactionHistory<TDocument, TSelection>,
  fallbackSelection?: TSelection,
): EditorTransactionHistoryResult<TDocument, TSelection>;
declare function redoEditorTransactionHistory<TDocument, TSelection = unknown>(
  history: EditorTransactionHistory<TDocument, TSelection>,
  fallbackSelection?: TSelection,
): EditorTransactionHistoryResult<TDocument, TSelection>;

export {
  type EditorSnapshotHistory,
  type EditorSnapshotHistoryOptions,
  type EditorTransaction,
  type EditorTransactionHistory,
  type EditorTransactionHistoryResult,
  canRedoEditorHistory,
  canUndoEditorHistory,
  commitEditorSnapshotHistory,
  createEditorSnapshotHistory,
  createEditorTransactionHistory,
  defaultEditorHistoryLimit,
  pushEditorTransactionHistory,
  redoEditorSnapshotHistory,
  redoEditorTransactionHistory,
  resetEditorSnapshotHistory,
  undoEditorSnapshotHistory,
  undoEditorTransactionHistory,
};
```

## hotkeys.d.ts

```ts
type EditorHotkeyEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey" | "target"
>;
type EditorHotkeyMap<TId extends string> = Record<TId, readonly string[]>;
/**
 * A command that can be rendered in UI and optionally invoked from one or more hotkeys.
 *
 * Command ids should be stable because other APIs use them for hotkey maps, conflict detection,
 * and persisted user preferences.
 */
type EditorCommandDefinition<TId extends string> = {
  id: TId;
  label: string;
  hotkeys?: readonly string[];
  disabled?: boolean;
  run?: (event: EditorHotkeyEvent) => void | Promise<void>;
};
type EditorParsedHotkey = {
  alt: boolean;
  ctrl: boolean;
  key: string;
  meta: boolean;
  mod: boolean;
  shift: boolean;
};
declare function matchesEditorHotkey(event: EditorHotkeyEvent, hotkey: string): boolean;
declare function isEditorEditableTarget(target: EventTarget | null): boolean;
declare function getEditorHotkeyFromKeyboardEvent(event: EditorHotkeyEvent): string;
declare function formatEditorShortcutLabel(shortcut: string): string;
declare function resolveEditorHotkeys<TId extends string>(
  defaults: EditorHotkeyMap<TId>,
  overrides?: Partial<EditorHotkeyMap<TId>>,
): EditorHotkeyMap<TId>;
declare function getEditorHotkeyConflicts<TId extends string>(
  id: TId,
  hotkey: string,
  hotkeys: EditorHotkeyMap<TId>,
  definitions?: readonly EditorCommandDefinition<TId>[],
): TId[];
declare function isEditorHotkeyValid(hotkey: string): boolean;
declare function getEditorCommandIdFromKeyboardEvent<TId extends string>(
  event: EditorHotkeyEvent,
  commands: readonly EditorCommandDefinition<TId>[],
): TId | null;
declare function parseEditorHotkey(hotkey: string): EditorParsedHotkey | null;

export {
  type EditorCommandDefinition,
  type EditorHotkeyEvent,
  type EditorHotkeyMap,
  type EditorParsedHotkey,
  formatEditorShortcutLabel,
  getEditorCommandIdFromKeyboardEvent,
  getEditorHotkeyConflicts,
  getEditorHotkeyFromKeyboardEvent,
  isEditorEditableTarget,
  isEditorHotkeyValid,
  matchesEditorHotkey,
  parseEditorHotkey,
  resolveEditorHotkeys,
};
```

## index.d.ts

```ts
export {
  EditorAspectContext,
  EditorAspectDefinition,
  EditorAspectSnapshot,
  EditorChangeOrigin,
  EditorResolvedAspect,
  ResolveEditorAspectsOptions,
  createEditorAspect,
  getEditorResolvedAspect,
  resolveEditorAspects,
} from "./aspects.js";
export {
  DownloadEditorJsonOptions,
  EditorBrowserErrorContext,
  EditorBrowserErrorHandler,
  EditorClipboardFallback,
  EditorClipboardJsonOptions,
  EditorStorageAdapter,
  LoadEditorStorageOptions,
  LocalStorageEditorStorageOptions,
  ReadEditorJsonFileOptions,
  SaveEditorStorageOptions,
  createLocalStorageEditorStorage,
  downloadEditorJson,
  ensureEditorJsonFilename,
  loadEditorStorage,
  readEditorClipboardJson,
  readEditorJsonFile,
  saveEditorStorage,
  writeEditorClipboardJson,
} from "./browser.js";
export {
  EditorCommandContext,
  EditorContextualCommandDefinition,
  EditorResolvedCommandDefinition,
  EditorSnapshotHistoryCommandId,
  EditorSnapshotHistoryCommandRunContext,
  EditorSnapshotHistoryCommandsOptions,
  createEditorSnapshotHistoryCommands,
  defaultEditorSnapshotHistoryCommandHotkeys,
  defaultEditorSnapshotHistoryCommandLabels,
  getRunnableEditorCommands,
  resolveEditorCommands,
} from "./commands.js";
export {
  EditorConstraintIssueOptions,
  EditorGraphConnection,
  ValidateEditorGraphConnectionOptions,
  ValidateEditorTimelineRangeOptions,
  clampEditorTimelineRange,
  createEditorConstraintIssue,
  validateEditorEntityIssues,
  validateEditorGraphConnection,
  validateEditorTimelineRange,
} from "./constraints.js";
export {
  EditorBounds,
  EditorEntityBase,
  EditorEntityBoundsAdapter,
  EditorEntityDocument,
  EditorEntityId,
  EditorGraphAdapter,
  EditorGraphEdge,
  EditorGraphPort,
  EditorIdFactory,
  EditorLayerAdapter,
  EditorPoint,
  EditorSize,
  EditorTimelineAdapter,
  EditorTimelineItem,
  EditorTimelineRange,
  EditorTimelineTrack,
  EditorWorkflowAdapter,
  createEditorEntityDocument,
  createIncrementingEditorIdFactory,
  getEditorEntity,
  isEditorEntityId,
} from "./entities.js";
export {
  EditorSnapshotHistory,
  EditorSnapshotHistoryOptions,
  EditorTransaction,
  EditorTransactionHistory,
  EditorTransactionHistoryResult,
  canRedoEditorHistory,
  canUndoEditorHistory,
  commitEditorSnapshotHistory,
  createEditorSnapshotHistory,
  createEditorTransactionHistory,
  defaultEditorHistoryLimit,
  pushEditorTransactionHistory,
  redoEditorSnapshotHistory,
  redoEditorTransactionHistory,
  resetEditorSnapshotHistory,
  undoEditorSnapshotHistory,
  undoEditorTransactionHistory,
} from "./history.js";
export {
  EditorCommandDefinition,
  EditorHotkeyEvent,
  EditorHotkeyMap,
  EditorParsedHotkey,
  formatEditorShortcutLabel,
  getEditorCommandIdFromKeyboardEvent,
  getEditorHotkeyConflicts,
  getEditorHotkeyFromKeyboardEvent,
  isEditorEditableTarget,
  isEditorHotkeyValid,
  matchesEditorHotkey,
  parseEditorHotkey,
  resolveEditorHotkeys,
} from "./hotkeys.js";
export {
  EditorEntityIndexes,
  EditorGraphIndexes,
  EditorTimelineIndexes,
  createEditorEntityIndexes,
  createEditorGraphIndexes,
  createEditorTimelineIndexes,
  groupEditorValidationIssuesByEntityId,
} from "./indexes.js";
export {
  EditorInteractionSession,
  EditorInteractionState,
  beginEditorInteraction,
  cancelEditorInteraction,
  commitEditorInteraction,
  commitEditorInteractionOperation,
  createEditorInteractionSession,
  idleEditorInteraction,
  isEditorInteractionActive,
  updateEditorInteractionPreview,
} from "./interaction.js";
export {
  EditorJsonObject,
  EditorJsonPrimitive,
  EditorJsonValue,
  createStableEditorJsonEquals,
  isEditorRecord,
  sortEditorJsonValue,
  stableEditorJsonFingerprint,
  stableEditorJsonStringify,
} from "./json.js";
export {
  ApplyEditorOperationOptions,
  EditorOperation,
  EditorOperationLogAdapter,
  EditorOperationLogMigration,
  EditorOperationLogMigrations,
  EditorOperationPreflightContext,
  EditorOperationPreflightIssue,
  EditorOperationRuntimeCommandId,
  EditorOperationRuntimeCommandsOptions,
  EditorOperationRuntimeOptions,
  EditorOperationRuntimeState,
  ReadEditorOperationLogOptions,
  SerializedEditorOperation,
  SerializedEditorOperationLog,
  applyEditorOperation,
  createEditorOperationRuntime,
  createEditorOperationRuntimeCommands,
  defaultEditorOperationRuntimeCommandHotkeys,
  defaultEditorOperationRuntimeCommandLabels,
  migrateEditorOperationLog,
  readEditorOperationLog,
  redoEditorOperationRuntime,
  serializeEditorOperationLog,
  undoEditorOperationRuntime,
} from "./operations.js";
export {
  CommitEditorRuntimeOptions,
  EditorRuntimeCommandId,
  EditorRuntimeCommandsOptions,
  EditorRuntimeOptions,
  EditorRuntimeSelection,
  EditorRuntimeState,
  EditorRuntimeStatus,
  EditorRuntimeUpdate,
  EditorRuntimeUpdateContext,
  EditorRuntimeValidationIssue,
  EditorRuntimeValidator,
  ResetEditorRuntimeOptions,
  commitEditorRuntime,
  createEditorRuntime,
  createEditorRuntimeCommands,
  defaultEditorRuntimeCommandHotkeys,
  defaultEditorRuntimeCommandLabels,
  markEditorRuntimeSaved,
  redoEditorRuntime,
  resetEditorRuntime,
  setEditorRuntimeSelection,
  undoEditorRuntime,
  validateEditorRuntime,
} from "./runtime.js";
export {
  EditorSelection,
  addEditorEntityToSelection,
  createEditorEntitySelection,
  editorSelectionFromTreeNode,
  emptyEditorSelection,
  getEditorSelectedEntityIds,
  getEditorSelectionPrimaryEntityId,
  getEditorSelectionTreeNodeId,
  isEditorEntitySelected,
  normalizeEditorSelection,
  removeEditorEntityFromSelection,
  toggleEditorEntitySelection,
} from "./selection.js";
export {
  EditorDocumentAdapter,
  EditorDocumentMigration,
  EditorDocumentMigrations,
  EditorJsonParseError,
  EditorMigrationError,
  EditorParseIssue,
  ReadEditorDocumentOptions,
  SerializeEditorDocumentOptions,
  SerializedEditorDocument,
  migrateEditorDocument,
  parseEditorDocumentJson,
  readEditorDocument,
  serializeEditorDocument,
} from "./serialization.js";
export {
  EditorSharePayloadTooLargeError,
  EncodeEditorSharePayloadOptions,
  decodeEditorSharePayload,
  editorShareTokenFromUrl,
  editorShareUrl,
  encodeEditorSharePayload,
} from "./share.js";
export {
  EditorTreeAdapter,
  EditorTreeItem,
  EditorTreeItemWindow,
  EditorTreeNode,
  EditorTreeNodeId,
  EditorTreeNodePath,
  EditorTreePath,
  EditorTreePathSegment,
  EditorTreeProjection,
  EditorTreeState,
  ProjectEditorTreeOptions,
  collapseEditorTreeNode,
  createEditorTreeState,
  expandEditorTreeAncestors,
  expandEditorTreeNode,
  getEditorTreeNodePath,
  projectEditorTree,
  selectAndRevealEditorTreeNode,
  selectEditorTreeNode,
  toggleEditorTreeNode,
  windowEditorTreeItems,
} from "./tree.js";
export {
  EditorSnapResult,
  EditorSnapTarget,
  EditorTimelineViewportState,
  EditorViewportClamp,
  EditorViewportState,
  FitEditorBoundsOptions,
  createEditorTimelineViewportState,
  createEditorViewportState,
  doEditorBoundsIntersect,
  editorPixelToTime,
  editorPointToScreenPoint,
  editorTimeToPixel,
  fitEditorBoundsInViewport,
  panEditorTimelineViewport,
  panEditorViewport,
  revealEditorBounds,
  screenPointToEditorPoint,
  snapEditorPoint,
  snapEditorValue,
  unionEditorBounds,
  zoomEditorTimelineViewportAtPixel,
  zoomEditorViewportAtPoint,
} from "./viewport.js";
```

## indexes.d.ts

```ts
import {
  EditorEntityBase,
  EditorEntityId,
  EditorGraphEdge,
  EditorTimelineItem,
  EditorEntityDocument,
} from "./entities.js";
import { EditorParseIssue } from "./serialization.js";

type EditorEntityIndexes<TEntity extends EditorEntityBase = EditorEntityBase> = {
  entitiesById: ReadonlyMap<EditorEntityId, TEntity>;
  childrenByParentId: ReadonlyMap<EditorEntityId | null, readonly TEntity[]>;
  parentByChildId: ReadonlyMap<EditorEntityId, EditorEntityId | null>;
  orderedRootIds: readonly EditorEntityId[];
};
type EditorGraphIndexes<TEdge extends EditorGraphEdge = EditorGraphEdge> = {
  edgesById: ReadonlyMap<EditorEntityId, TEdge>;
  incomingEdgesByNodeId: ReadonlyMap<EditorEntityId, readonly TEdge[]>;
  outgoingEdgesByNodeId: ReadonlyMap<EditorEntityId, readonly TEdge[]>;
};
type EditorTimelineIndexes<TItem extends EditorTimelineItem = EditorTimelineItem> = {
  trackItemsByTrackId: ReadonlyMap<EditorEntityId, readonly TItem[]>;
};
declare function createEditorEntityIndexes<TEntity extends EditorEntityBase>(
  document: EditorEntityDocument<TEntity>,
): EditorEntityIndexes<TEntity>;
declare function createEditorGraphIndexes<TEdge extends EditorGraphEdge>(
  edges: readonly TEdge[],
): EditorGraphIndexes<TEdge>;
declare function createEditorTimelineIndexes<TItem extends EditorTimelineItem>(
  items: readonly TItem[],
): EditorTimelineIndexes<TItem>;
declare function groupEditorValidationIssuesByEntityId(
  issues: readonly EditorParseIssue[],
): ReadonlyMap<EditorEntityId, readonly EditorParseIssue[]>;

export {
  type EditorEntityIndexes,
  type EditorGraphIndexes,
  type EditorTimelineIndexes,
  createEditorEntityIndexes,
  createEditorGraphIndexes,
  createEditorTimelineIndexes,
  groupEditorValidationIssuesByEntityId,
};
```

## interaction.d.ts

```ts
import { EditorEntityId, EditorPoint } from "./entities.js";
import { EditorOperationRuntimeState, EditorOperation } from "./operations.js";
import "./aspects.js";
import "./hotkeys.js";
import "./history.js";
import "./runtime.js";
import "./serialization.js";

type EditorInteractionState =
  | {
      kind: "idle";
    }
  | {
      kind: "dragging";
      ids: readonly EditorEntityId[];
      origin: EditorPoint;
    }
  | {
      kind: "resizing";
      id: EditorEntityId;
      handle: string;
    }
  | {
      kind: "connecting";
      fromId: EditorEntityId;
      fromPortId?: string;
    }
  | {
      kind: "scrubbing";
      time: number;
    };
type EditorInteractionSession<
  TDocument,
  TInteraction extends EditorInteractionState = EditorInteractionState,
> = {
  committedDocument: TDocument;
  previewDocument: TDocument;
  state: TInteraction;
};
declare const idleEditorInteraction: EditorInteractionState;
declare function createEditorInteractionSession<TDocument>(
  document: TDocument,
): EditorInteractionSession<TDocument>;
declare function beginEditorInteraction<TDocument, TInteraction extends EditorInteractionState>(
  session: EditorInteractionSession<TDocument>,
  state: TInteraction,
): EditorInteractionSession<TDocument, TInteraction>;
declare function updateEditorInteractionPreview<
  TDocument,
  TInteraction extends EditorInteractionState,
>(
  session: EditorInteractionSession<TDocument, TInteraction>,
  previewDocument: TDocument,
): EditorInteractionSession<TDocument, TInteraction>;
declare function cancelEditorInteraction<TDocument>(
  session: EditorInteractionSession<TDocument>,
): EditorInteractionSession<TDocument>;
declare function commitEditorInteraction<TDocument>(
  session: EditorInteractionSession<TDocument>,
): EditorInteractionSession<TDocument>;
declare function commitEditorInteractionOperation<TDocument, TSelection = unknown>(
  runtime: EditorOperationRuntimeState<TDocument, TSelection>,
  operation: EditorOperation<TDocument, TSelection>,
): EditorOperationRuntimeState<TDocument, TSelection>;
declare function isEditorInteractionActive(state: EditorInteractionState): boolean;

export {
  type EditorInteractionSession,
  type EditorInteractionState,
  beginEditorInteraction,
  cancelEditorInteraction,
  commitEditorInteraction,
  commitEditorInteractionOperation,
  createEditorInteractionSession,
  idleEditorInteraction,
  isEditorInteractionActive,
  updateEditorInteractionPreview,
};
```

## json.d.ts

```ts
type EditorJsonPrimitive = string | number | boolean | null;
type EditorJsonValue = EditorJsonPrimitive | EditorJsonObject | EditorJsonValue[];
type EditorJsonObject = {
  [key: string]: EditorJsonValue;
};
declare function isEditorRecord(value: unknown): value is Record<string, unknown>;
declare function sortEditorJsonValue(value: unknown): unknown;
declare function stableEditorJsonStringify(value: unknown): string;
declare function stableEditorJsonFingerprint(value: unknown): string;
declare function createStableEditorJsonEquals<T>(): (left: T, right: T) => boolean;

export {
  type EditorJsonObject,
  type EditorJsonPrimitive,
  type EditorJsonValue,
  createStableEditorJsonEquals,
  isEditorRecord,
  sortEditorJsonValue,
  stableEditorJsonFingerprint,
  stableEditorJsonStringify,
};
```

## operations.d.ts

```ts
import { EditorChangeOrigin } from "./aspects.js";
import { EditorHotkeyMap, EditorCommandDefinition } from "./hotkeys.js";
import { EditorTransactionHistory } from "./history.js";
import { EditorRuntimeState, EditorRuntimeOptions } from "./runtime.js";
import { EditorParseIssue } from "./serialization.js";

type EditorOperation<TDocument, TSelection = unknown> = {
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
type EditorOperationPreflightContext<TDocument, TSelection = unknown> = {
  document: TDocument;
  operation: EditorOperation<TDocument, TSelection>;
  runtime: EditorRuntimeState<TDocument, TSelection>;
};
type EditorOperationPreflightIssue = {
  path: string;
  message: string;
  severity?: "error" | "warning";
};
type EditorOperationRuntimeOptions<TDocument, TSelection = unknown> = EditorRuntimeOptions<
  TDocument,
  TSelection
> & {
  operationHistoryLimit?: number;
  preflight?: (
    context: EditorOperationPreflightContext<TDocument, TSelection>,
  ) => readonly EditorOperationPreflightIssue[];
};
type EditorOperationRuntimeState<TDocument, TSelection = unknown> = {
  runtime: EditorRuntimeState<TDocument, TSelection>;
  operationHistory: EditorTransactionHistory<TDocument, TSelection>;
  canUndo: boolean;
  canRedo: boolean;
  lastMergeKey: string | null;
  issues: readonly EditorOperationPreflightIssue[];
};
type ApplyEditorOperationOptions = {
  merge?: boolean;
};
type SerializedEditorOperation<
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
type SerializedEditorOperationLog<
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
type EditorOperationLogAdapter<TOperation> = {
  format: string;
  schemaVersion: number | string;
  read: (input: unknown, path?: string) => TOperation;
  normalize?: (operation: TOperation) => TOperation;
  validate?: (operation: TOperation) => readonly EditorParseIssue[];
};
type EditorOperationLogMigration<TOperation> = (
  input: SerializedEditorOperationLog<unknown>,
  adapter: EditorOperationLogAdapter<TOperation>,
) => SerializedEditorOperationLog<unknown> | unknown;
type EditorOperationLogMigrations<TOperation> = Record<
  string | number,
  EditorOperationLogMigration<TOperation>
>;
type ReadEditorOperationLogOptions<TOperation> = {
  migrations?: EditorOperationLogMigrations<TOperation>;
  path?: string;
};
type EditorOperationRuntimeCommandId = "undo" | "redo";
declare const defaultEditorOperationRuntimeCommandHotkeys: EditorHotkeyMap<EditorOperationRuntimeCommandId>;
declare const defaultEditorOperationRuntimeCommandLabels: Record<
  EditorOperationRuntimeCommandId,
  string
>;
type EditorOperationRuntimeCommandsOptions<TDocument, TSelection = unknown> = {
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
declare function createEditorOperationRuntime<TDocument, TSelection = unknown>(
  options: EditorOperationRuntimeOptions<TDocument, TSelection>,
): EditorOperationRuntimeState<TDocument, TSelection>;
declare function applyEditorOperation<TDocument, TSelection = unknown>(
  state: EditorOperationRuntimeState<TDocument, TSelection>,
  operation: EditorOperation<TDocument, TSelection>,
  options?: ApplyEditorOperationOptions,
): EditorOperationRuntimeState<TDocument, TSelection>;
declare function undoEditorOperationRuntime<TDocument, TSelection = unknown>(
  state: EditorOperationRuntimeState<TDocument, TSelection>,
  options?: {
    origin?: EditorChangeOrigin;
  },
): EditorOperationRuntimeState<TDocument, TSelection>;
declare function redoEditorOperationRuntime<TDocument, TSelection = unknown>(
  state: EditorOperationRuntimeState<TDocument, TSelection>,
  options?: {
    origin?: EditorChangeOrigin;
  },
): EditorOperationRuntimeState<TDocument, TSelection>;
declare function createEditorOperationRuntimeCommands<TDocument, TSelection = unknown>(
  options: EditorOperationRuntimeCommandsOptions<TDocument, TSelection>,
): readonly EditorCommandDefinition<EditorOperationRuntimeCommandId>[];
declare function serializeEditorOperationLog<
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
): SerializedEditorOperationLog<TPayload, TFormat, TVersion>;
declare function readEditorOperationLog<TOperation>(
  input: unknown,
  adapter: EditorOperationLogAdapter<TOperation>,
  options?: ReadEditorOperationLogOptions<TOperation>,
): readonly TOperation[];
declare function migrateEditorOperationLog<TOperation>(
  input: unknown,
  adapter: EditorOperationLogAdapter<TOperation>,
  migrations?: EditorOperationLogMigrations<TOperation>,
  seenVersions?: ReadonlySet<string>,
): unknown;

export {
  type ApplyEditorOperationOptions,
  type EditorOperation,
  type EditorOperationLogAdapter,
  type EditorOperationLogMigration,
  type EditorOperationLogMigrations,
  type EditorOperationPreflightContext,
  type EditorOperationPreflightIssue,
  type EditorOperationRuntimeCommandId,
  type EditorOperationRuntimeCommandsOptions,
  type EditorOperationRuntimeOptions,
  type EditorOperationRuntimeState,
  type ReadEditorOperationLogOptions,
  type SerializedEditorOperation,
  type SerializedEditorOperationLog,
  applyEditorOperation,
  createEditorOperationRuntime,
  createEditorOperationRuntimeCommands,
  defaultEditorOperationRuntimeCommandHotkeys,
  defaultEditorOperationRuntimeCommandLabels,
  migrateEditorOperationLog,
  readEditorOperationLog,
  redoEditorOperationRuntime,
  serializeEditorOperationLog,
  undoEditorOperationRuntime,
};
```

## react.d.ts

```ts
import * as React from "react";
import { EditorCommandDefinition } from "./hotkeys.js";
import {
  EditorRuntimeOptions,
  EditorRuntimeState,
  EditorRuntimeUpdate,
  CommitEditorRuntimeOptions,
  ResetEditorRuntimeOptions,
  EditorRuntimeSelection,
} from "./runtime.js";
import { EditorTreeState, EditorTreeNodeId } from "./tree.js";
import "./aspects.js";
import "./history.js";
import "./serialization.js";

type ControllableEditorStateOptions<T> = {
  value?: T;
  defaultValue: T | (() => T);
  onChange?: (value: T) => void;
};
declare function useControllableEditorState<T>({
  value,
  defaultValue,
  onChange,
}: ControllableEditorStateOptions<T>): [T, (value: T | ((previous: T) => T)) => void];
type UseEditorRuntimeOptions<TDocument, TSelection = unknown> = EditorRuntimeOptions<
  TDocument,
  TSelection
> & {
  value?: EditorRuntimeState<TDocument, TSelection>;
  onChange?: (state: EditorRuntimeState<TDocument, TSelection>) => void;
};
type UseEditorRuntimeResult<TDocument, TSelection = unknown> = {
  state: EditorRuntimeState<TDocument, TSelection>;
  setState: React.Dispatch<React.SetStateAction<EditorRuntimeState<TDocument, TSelection>>>;
  commit: (
    update: EditorRuntimeUpdate<TDocument, TSelection>,
    options?: CommitEditorRuntimeOptions<TSelection>,
  ) => void;
  undo: () => void;
  redo: () => void;
  reset: (document: TDocument, options?: ResetEditorRuntimeOptions<TSelection>) => void;
  markSaved: () => void;
  setSelection: (selection: EditorRuntimeSelection<TSelection>) => void;
};
declare function useEditorRuntime<TDocument, TSelection = unknown>(
  options: UseEditorRuntimeOptions<TDocument, TSelection>,
): UseEditorRuntimeResult<TDocument, TSelection>;
type UseEditorHotkeysOptions<TId extends string> = {
  commands: readonly EditorCommandDefinition<TId>[];
  disabled?: boolean;
  readOnly?: boolean;
  allowEditableTargets?: boolean;
  scopeRef?: React.RefObject<HTMLElement | null>;
};
declare function useEditorHotkeys<TId extends string>({
  commands,
  disabled,
  readOnly,
  allowEditableTargets,
  scopeRef,
}: UseEditorHotkeysOptions<TId>): void;
type UseEditorTreeStateResult = {
  state: EditorTreeState;
  setState: React.Dispatch<React.SetStateAction<EditorTreeState>>;
  select: (id: EditorTreeNodeId | null) => void;
  expand: (id: EditorTreeNodeId) => void;
  collapse: (id: EditorTreeNodeId) => void;
  toggle: (id: EditorTreeNodeId) => void;
};
declare function useEditorTreeState(
  initialState?: Partial<EditorTreeState>,
): UseEditorTreeStateResult;

export {
  type ControllableEditorStateOptions,
  type UseEditorHotkeysOptions,
  type UseEditorRuntimeOptions,
  type UseEditorRuntimeResult,
  type UseEditorTreeStateResult,
  useControllableEditorState,
  useEditorHotkeys,
  useEditorRuntime,
  useEditorTreeState,
};
```

## runtime.d.ts

```ts
import { EditorChangeOrigin, EditorAspectSnapshot, EditorAspectDefinition } from "./aspects.js";
import { EditorHotkeyMap, EditorCommandDefinition } from "./hotkeys.js";
import { EditorSnapshotHistory, EditorSnapshotHistoryOptions } from "./history.js";
import { EditorParseIssue } from "./serialization.js";

type EditorRuntimeStatus = "clean" | "dirty";
type EditorRuntimeSelection<TSelection = unknown> = TSelection | null;
type EditorRuntimeUpdateContext<TDocument, TSelection = unknown> = {
  document: TDocument;
  selection: EditorRuntimeSelection<TSelection>;
  revision: number;
};
type EditorRuntimeUpdate<TDocument, TSelection = unknown> =
  | TDocument
  | ((context: EditorRuntimeUpdateContext<TDocument, TSelection>) => TDocument);
type EditorRuntimeValidationIssue = EditorParseIssue;
type EditorRuntimeValidator<TDocument> = (
  document: TDocument,
) => readonly EditorRuntimeValidationIssue[];
type EditorRuntimeOptions<TDocument, TSelection = unknown> = {
  initialDocument: TDocument;
  initialSelection?: EditorRuntimeSelection<TSelection>;
  history?: EditorSnapshotHistoryOptions<TDocument>;
  validate?: EditorRuntimeValidator<TDocument>;
  aspects?: readonly EditorAspectDefinition<TDocument, unknown>[];
  origin?: EditorChangeOrigin;
};
type EditorRuntimeState<TDocument, TSelection = unknown> = {
  document: TDocument;
  selection: EditorRuntimeSelection<TSelection>;
  history: EditorSnapshotHistory<TDocument>;
  revision: number;
  savedRevision: number;
  status: EditorRuntimeStatus;
  canUndo: boolean;
  canRedo: boolean;
  issues: readonly EditorRuntimeValidationIssue[];
  aspectSnapshot: EditorAspectSnapshot<TDocument>;
  origin?: EditorChangeOrigin;
};
type CommitEditorRuntimeOptions<TSelection = unknown> = {
  selection?: EditorRuntimeSelection<TSelection>;
  origin?: EditorChangeOrigin;
  markSaved?: boolean;
};
type ResetEditorRuntimeOptions<TSelection = unknown> = {
  selection?: EditorRuntimeSelection<TSelection>;
  origin?: EditorChangeOrigin;
  markSaved?: boolean;
};
type EditorRuntimeCommandId = "undo" | "redo" | "reset" | "save";
declare const defaultEditorRuntimeCommandHotkeys: EditorHotkeyMap<EditorRuntimeCommandId>;
declare const defaultEditorRuntimeCommandLabels: Record<EditorRuntimeCommandId, string>;
type EditorRuntimeCommandsOptions<TDocument, TSelection = unknown> = {
  runtime: EditorRuntimeState<TDocument, TSelection>;
  setRuntime: (
    updater: (
      runtime: EditorRuntimeState<TDocument, TSelection>,
    ) => EditorRuntimeState<TDocument, TSelection>,
  ) => void;
  getResetDocument: () => TDocument;
  onSave?: (runtime: EditorRuntimeState<TDocument, TSelection>) => void | Promise<void>;
  hotkeys?: Partial<EditorHotkeyMap<EditorRuntimeCommandId>>;
  labels?: Partial<Record<EditorRuntimeCommandId, string>>;
  include?: readonly EditorRuntimeCommandId[];
  disabled?: Partial<Record<EditorRuntimeCommandId, boolean>>;
};
declare function createEditorRuntime<TDocument, TSelection = unknown>(
  options: EditorRuntimeOptions<TDocument, TSelection>,
): EditorRuntimeState<TDocument, TSelection>;
declare function commitEditorRuntime<TDocument, TSelection = unknown>(
  state: EditorRuntimeState<TDocument, TSelection>,
  update: EditorRuntimeUpdate<TDocument, TSelection>,
  options?: CommitEditorRuntimeOptions<TSelection>,
): EditorRuntimeState<TDocument, TSelection>;
declare function undoEditorRuntime<TDocument, TSelection = unknown>(
  state: EditorRuntimeState<TDocument, TSelection>,
  options?: {
    origin?: EditorChangeOrigin;
  },
): EditorRuntimeState<TDocument, TSelection>;
declare function redoEditorRuntime<TDocument, TSelection = unknown>(
  state: EditorRuntimeState<TDocument, TSelection>,
  options?: {
    origin?: EditorChangeOrigin;
  },
): EditorRuntimeState<TDocument, TSelection>;
declare function resetEditorRuntime<TDocument, TSelection = unknown>(
  state: EditorRuntimeState<TDocument, TSelection>,
  document: TDocument,
  options?: ResetEditorRuntimeOptions<TSelection>,
): EditorRuntimeState<TDocument, TSelection>;
declare function markEditorRuntimeSaved<TDocument, TSelection = unknown>(
  state: EditorRuntimeState<TDocument, TSelection>,
): EditorRuntimeState<TDocument, TSelection>;
declare function setEditorRuntimeSelection<TDocument, TSelection = unknown>(
  state: EditorRuntimeState<TDocument, TSelection>,
  selection: EditorRuntimeSelection<TSelection>,
): EditorRuntimeState<TDocument, TSelection>;
declare function validateEditorRuntime<TDocument, TSelection = unknown>(
  state: EditorRuntimeState<TDocument, TSelection>,
): EditorRuntimeState<TDocument, TSelection>;
declare function createEditorRuntimeCommands<TDocument, TSelection = unknown>(
  options: EditorRuntimeCommandsOptions<TDocument, TSelection>,
): readonly EditorCommandDefinition<EditorRuntimeCommandId>[];

export {
  type CommitEditorRuntimeOptions,
  type EditorRuntimeCommandId,
  type EditorRuntimeCommandsOptions,
  type EditorRuntimeOptions,
  type EditorRuntimeSelection,
  type EditorRuntimeState,
  type EditorRuntimeStatus,
  type EditorRuntimeUpdate,
  type EditorRuntimeUpdateContext,
  type EditorRuntimeValidationIssue,
  type EditorRuntimeValidator,
  type ResetEditorRuntimeOptions,
  commitEditorRuntime,
  createEditorRuntime,
  createEditorRuntimeCommands,
  defaultEditorRuntimeCommandHotkeys,
  defaultEditorRuntimeCommandLabels,
  markEditorRuntimeSaved,
  redoEditorRuntime,
  resetEditorRuntime,
  setEditorRuntimeSelection,
  undoEditorRuntime,
  validateEditorRuntime,
};
```

## selection.d.ts

```ts
import { EditorEntityId } from "./entities.js";
import { EditorTreeNode, EditorTreeNodeId } from "./tree.js";

type EditorSelection =
  | {
      kind: "empty";
    }
  | {
      kind: "entity";
      ids: readonly EditorEntityId[];
      anchorId?: EditorEntityId;
    }
  | {
      kind: "range";
      anchorId: EditorEntityId;
      focusId: EditorEntityId;
    }
  | {
      kind: "port";
      entityId: EditorEntityId;
      portId: string;
    }
  | {
      kind: "time";
      start: number;
      end: number;
      trackIds?: readonly EditorEntityId[];
    };
declare const emptyEditorSelection: EditorSelection;
declare function createEditorEntitySelection(
  ids: readonly EditorEntityId[],
  anchorId?: EditorEntityId | undefined,
): EditorSelection;
declare function getEditorSelectedEntityIds(selection: EditorSelection | null): EditorEntityId[];
declare function isEditorEntitySelected(
  selection: EditorSelection | null,
  id: EditorEntityId,
): boolean;
declare function addEditorEntityToSelection(
  selection: EditorSelection | null,
  id: EditorEntityId,
): EditorSelection;
declare function removeEditorEntityFromSelection(
  selection: EditorSelection | null,
  id: EditorEntityId,
): EditorSelection;
declare function toggleEditorEntitySelection(
  selection: EditorSelection | null,
  id: EditorEntityId,
): EditorSelection;
declare function normalizeEditorSelection(
  selection: EditorSelection | null,
  exists: (id: EditorEntityId) => boolean,
): EditorSelection;
declare function editorSelectionFromTreeNode(
  node:
    | EditorTreeNode<{
        entityId?: EditorEntityId;
      }>
    | EditorTreeNode,
): EditorSelection;
declare function getEditorSelectionPrimaryEntityId(
  selection: EditorSelection | null,
): EditorEntityId | null;
declare function getEditorSelectionTreeNodeId(
  selection: EditorSelection | null,
  mapEntityIdToTreeNodeId?: (id: EditorEntityId) => EditorTreeNodeId | null | undefined,
): EditorTreeNodeId | null;

export {
  type EditorSelection,
  addEditorEntityToSelection,
  createEditorEntitySelection,
  editorSelectionFromTreeNode,
  emptyEditorSelection,
  getEditorSelectedEntityIds,
  getEditorSelectionPrimaryEntityId,
  getEditorSelectionTreeNodeId,
  isEditorEntitySelected,
  normalizeEditorSelection,
  removeEditorEntityFromSelection,
  toggleEditorEntitySelection,
};
```

## serialization.d.ts

```ts
type EditorParseIssue = {
  path: string;
  message: string;
};
declare class EditorJsonParseError extends Error {
  issues: readonly EditorParseIssue[];
  constructor(issues: readonly EditorParseIssue[]);
}
declare class EditorMigrationError extends Error {
  constructor(message: string);
}
/**
 * Defines how a host editor document is normalized, read from unknown input, validated, and
 * identified inside a serialized envelope.
 *
 * `format` should be globally specific to the document type. `schemaVersion` is compared against
 * incoming envelopes before migrations run.
 */
type EditorDocumentAdapter<TDocument> = {
  format: string;
  schemaVersion: number | string;
  normalize: (document: TDocument) => TDocument;
  read: (input: unknown, path?: string) => TDocument;
  validate?: (document: TDocument) => readonly EditorParseIssue[];
  unwrapLegacyEnvelope?: (input: Record<string, unknown>) => unknown | undefined;
};
type SerializedEditorDocument<
  TDocument,
  TFormat extends string = string,
  TVersion extends number | string = number,
> = {
  format: TFormat;
  schemaVersion: TVersion;
  exportedAt?: string;
  metadata?: Record<string, unknown>;
  document: TDocument;
};
type SerializeEditorDocumentOptions = {
  exportedAt?: string | Date | false;
  metadata?: Record<string, unknown>;
};
type ReadEditorDocumentOptions<TDocument> = {
  migrations?: EditorDocumentMigrations<TDocument>;
  path?: string;
};
type EditorDocumentMigration<TDocument> = (
  input: SerializedEditorDocument<unknown>,
  adapter: EditorDocumentAdapter<TDocument>,
) => SerializedEditorDocument<unknown> | unknown;
type EditorDocumentMigrations<TDocument> = Record<
  string | number,
  EditorDocumentMigration<TDocument>
>;
declare function serializeEditorDocument<
  TDocument,
  TFormat extends string = string,
  TVersion extends number | string = number,
>(
  document: TDocument,
  adapter: EditorDocumentAdapter<TDocument> & {
    format: TFormat;
    schemaVersion: TVersion;
  },
  options?: SerializeEditorDocumentOptions,
): SerializedEditorDocument<TDocument, TFormat, TVersion>;
declare function parseEditorDocumentJson<TDocument>(
  text: string,
  adapter: EditorDocumentAdapter<TDocument>,
  options?: ReadEditorDocumentOptions<TDocument>,
): TDocument;
declare function readEditorDocument<TDocument>(
  input: unknown,
  adapter: EditorDocumentAdapter<TDocument>,
  options?: ReadEditorDocumentOptions<TDocument>,
): TDocument;
declare function migrateEditorDocument<TDocument>(
  input: unknown,
  adapter: EditorDocumentAdapter<TDocument>,
  migrations?: EditorDocumentMigrations<TDocument>,
  seenVersions?: ReadonlySet<string>,
): unknown;

export {
  type EditorDocumentAdapter,
  type EditorDocumentMigration,
  type EditorDocumentMigrations,
  EditorJsonParseError,
  EditorMigrationError,
  type EditorParseIssue,
  type ReadEditorDocumentOptions,
  type SerializeEditorDocumentOptions,
  type SerializedEditorDocument,
  migrateEditorDocument,
  parseEditorDocumentJson,
  readEditorDocument,
  serializeEditorDocument,
};
```

## share.d.ts

```ts
type EncodeEditorSharePayloadOptions = {
  maxBytes?: number;
};
declare class EditorSharePayloadTooLargeError extends Error {
  byteLength: number;
  maxBytes: number;
  constructor(byteLength: number, maxBytes: number);
}
declare function editorShareTokenFromUrl(url: string, param?: string): string | null;
declare function editorShareUrl(
  origin: string,
  path: string,
  token: string,
  param?: string,
): string;
declare function encodeEditorSharePayload(
  payload: unknown,
  options?: EncodeEditorSharePayloadOptions,
): Promise<string>;
declare function decodeEditorSharePayload<T = unknown>(token: string): Promise<T>;

export {
  EditorSharePayloadTooLargeError,
  type EncodeEditorSharePayloadOptions,
  decodeEditorSharePayload,
  editorShareTokenFromUrl,
  editorShareUrl,
  encodeEditorSharePayload,
};
```

## tree.d.ts

```ts
type EditorTreeNodeId = string;
type EditorTreePathSegment = string | number;
type EditorTreePath = readonly EditorTreePathSegment[];
type EditorTreeNode<TMetadata = unknown> = {
  id: EditorTreeNodeId;
  label: string;
  children?: readonly EditorTreeNode<TMetadata>[];
  expandedByDefault?: boolean;
  kind?: string;
  metadata?: TMetadata;
  path?: EditorTreePath;
  selectable?: boolean;
};
/**
 * Projects an editor-owned document model into a stable tree model for navigation UIs.
 *
 * Adapters should return stable node ids so selection and expansion state can survive document
 * edits, reordering, and collaboration sync.
 */
type EditorTreeAdapter<TDocument, TMetadata = unknown> = {
  getRoot: (document: TDocument) => EditorTreeNode<TMetadata>;
};
type EditorTreeState = {
  expandedIds: readonly EditorTreeNodeId[];
  selectedId: EditorTreeNodeId | null;
};
type EditorTreeItem<TMetadata = unknown> = {
  node: EditorTreeNode<TMetadata>;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  parentId: EditorTreeNodeId | null;
  selected: boolean;
};
type EditorTreeProjection<TMetadata = unknown> = {
  root: EditorTreeNode<TMetadata>;
  items: readonly EditorTreeItem<TMetadata>[];
  nodesById: ReadonlyMap<EditorTreeNodeId, EditorTreeNode<TMetadata>>;
  parentIdsById: ReadonlyMap<EditorTreeNodeId, EditorTreeNodeId | null>;
  state: EditorTreeState;
};
type EditorTreeItemWindow<TMetadata = unknown> = {
  items: readonly EditorTreeItem<TMetadata>[];
  start: number;
  end: number;
  total: number;
};
type EditorTreeNodePath = readonly EditorTreeNodeId[];
type ProjectEditorTreeOptions = {
  state?: EditorTreeState;
};
declare function createEditorTreeState(options?: Partial<EditorTreeState>): EditorTreeState;
declare function projectEditorTree<TDocument, TMetadata = unknown>(
  document: TDocument,
  adapter: EditorTreeAdapter<TDocument, TMetadata>,
  options?: ProjectEditorTreeOptions,
): EditorTreeProjection<TMetadata>;
declare function selectEditorTreeNode(
  state: EditorTreeState,
  id: EditorTreeNodeId | null,
): EditorTreeState;
declare function expandEditorTreeNode(
  state: EditorTreeState,
  id: EditorTreeNodeId,
): EditorTreeState;
declare function collapseEditorTreeNode(
  state: EditorTreeState,
  id: EditorTreeNodeId,
): EditorTreeState;
declare function toggleEditorTreeNode(
  state: EditorTreeState,
  id: EditorTreeNodeId,
): EditorTreeState;
declare function getEditorTreeNodePath(
  projection: Pick<EditorTreeProjection, "parentIdsById">,
  id: EditorTreeNodeId,
): EditorTreeNodePath;
declare function expandEditorTreeAncestors(
  state: EditorTreeState,
  projection: Pick<EditorTreeProjection, "parentIdsById">,
  id: EditorTreeNodeId,
): EditorTreeState;
declare function selectAndRevealEditorTreeNode(
  state: EditorTreeState,
  projection: Pick<EditorTreeProjection, "parentIdsById">,
  id: EditorTreeNodeId,
): EditorTreeState;
declare function windowEditorTreeItems<TMetadata>(
  items: readonly EditorTreeItem<TMetadata>[],
  options: {
    start?: number;
    count: number;
  },
): EditorTreeItemWindow<TMetadata>;

export {
  type EditorTreeAdapter,
  type EditorTreeItem,
  type EditorTreeItemWindow,
  type EditorTreeNode,
  type EditorTreeNodeId,
  type EditorTreeNodePath,
  type EditorTreePath,
  type EditorTreePathSegment,
  type EditorTreeProjection,
  type EditorTreeState,
  type ProjectEditorTreeOptions,
  collapseEditorTreeNode,
  createEditorTreeState,
  expandEditorTreeAncestors,
  expandEditorTreeNode,
  getEditorTreeNodePath,
  projectEditorTree,
  selectAndRevealEditorTreeNode,
  selectEditorTreeNode,
  toggleEditorTreeNode,
  windowEditorTreeItems,
};
```

## viewport.d.ts

```ts
import { EditorBounds, EditorPoint } from "./entities.js";

type EditorViewportState = {
  x: number;
  y: number;
  zoom: number;
};
type EditorTimelineViewportState = {
  start: number;
  end: number;
  pixelsPerUnit: number;
};
type EditorViewportClamp = {
  minZoom?: number;
  maxZoom?: number;
};
type EditorSnapTarget = {
  value: number;
  id?: string;
  kind?: string;
};
type EditorSnapResult = {
  value: number;
  snapped: boolean;
  target?: EditorSnapTarget;
};
type FitEditorBoundsOptions = EditorViewportClamp & {
  padding?: number;
  viewportSize: {
    height: number;
    width: number;
  };
};
declare function createEditorViewportState(
  state?: Partial<EditorViewportState>,
): EditorViewportState;
declare function panEditorViewport(
  viewport: EditorViewportState,
  delta: EditorPoint,
): EditorViewportState;
declare function zoomEditorViewportAtPoint(
  viewport: EditorViewportState,
  zoom: number,
  point: EditorPoint,
  clamp?: EditorViewportClamp,
): EditorViewportState;
declare function screenPointToEditorPoint(
  point: EditorPoint,
  viewport: EditorViewportState,
): EditorPoint;
declare function editorPointToScreenPoint(
  point: EditorPoint,
  viewport: EditorViewportState,
): EditorPoint;
declare function fitEditorBoundsInViewport(
  bounds: EditorBounds,
  options: FitEditorBoundsOptions,
): EditorViewportState;
declare function unionEditorBounds(bounds: readonly EditorBounds[]): EditorBounds | null;
declare function doEditorBoundsIntersect(left: EditorBounds, right: EditorBounds): boolean;
declare function snapEditorValue(
  value: number,
  targets: readonly EditorSnapTarget[],
  threshold?: number,
): EditorSnapResult;
declare function snapEditorPoint(
  point: EditorPoint,
  targets: {
    x?: readonly EditorSnapTarget[];
    y?: readonly EditorSnapTarget[];
  },
  threshold?: number,
): EditorPoint;
declare function revealEditorBounds(
  bounds: readonly EditorBounds[],
  options: FitEditorBoundsOptions,
): EditorViewportState | null;
declare function createEditorTimelineViewportState(
  state?: Partial<EditorTimelineViewportState>,
): EditorTimelineViewportState;
declare function editorTimeToPixel(time: number, viewport: EditorTimelineViewportState): number;
declare function editorPixelToTime(pixel: number, viewport: EditorTimelineViewportState): number;
declare function panEditorTimelineViewport(
  viewport: EditorTimelineViewportState,
  deltaUnits: number,
): EditorTimelineViewportState;
declare function zoomEditorTimelineViewportAtPixel(
  viewport: EditorTimelineViewportState,
  pixelsPerUnit: number,
  pixel: number,
): EditorTimelineViewportState;

export {
  type EditorSnapResult,
  type EditorSnapTarget,
  type EditorTimelineViewportState,
  type EditorViewportClamp,
  type EditorViewportState,
  type FitEditorBoundsOptions,
  createEditorTimelineViewportState,
  createEditorViewportState,
  doEditorBoundsIntersect,
  editorPixelToTime,
  editorPointToScreenPoint,
  editorTimeToPixel,
  fitEditorBoundsInViewport,
  panEditorTimelineViewport,
  panEditorViewport,
  revealEditorBounds,
  screenPointToEditorPoint,
  snapEditorPoint,
  snapEditorValue,
  unionEditorBounds,
  zoomEditorTimelineViewportAtPixel,
  zoomEditorViewportAtPoint,
};
```
