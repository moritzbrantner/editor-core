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
type EditorStorageAdapter<TValue> = {
  load: () => TValue | null | Promise<TValue | null>;
  save: (value: TValue) => void | Promise<void>;
};
type LocalStorageEditorStorageOptions<TValue> = {
  key: string;
  storage?: Storage;
  parse?: (input: unknown) => TValue;
  serialize?: (value: TValue) => unknown;
};
type EditorClipboardFallback = {
  text?: string | null;
};
type EditorClipboardJsonOptions = {
  fallback?: EditorClipboardFallback;
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
  options?: {
    normalize?: (value: TValue) => TValue;
  },
): Promise<TValue>;
declare function saveEditorStorage<TValue>(
  storage: EditorStorageAdapter<TValue>,
  value: TValue,
  options?: {
    normalize?: (value: TValue) => TValue;
  },
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
  type EditorClipboardFallback,
  type EditorClipboardJsonOptions,
  type EditorStorageAdapter,
  type LocalStorageEditorStorageOptions,
  type ReadEditorJsonFileOptions,
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
import { EditorHotkeyEvent, EditorHotkeyMap, EditorCommandDefinition } from "./hotkeys.js";

type EditorSnapshotHistoryCommandId = "undo" | "redo" | "reset";
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

export {
  type EditorSnapshotHistoryCommandId,
  type EditorSnapshotHistoryCommandRunContext,
  type EditorSnapshotHistoryCommandsOptions,
  createEditorSnapshotHistoryCommands,
  defaultEditorSnapshotHistoryCommandHotkeys,
  defaultEditorSnapshotHistoryCommandLabels,
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
declare function getEditorCommandIdFromKeyboardEvent<TId extends string>(
  event: EditorHotkeyEvent,
  commands: readonly EditorCommandDefinition<TId>[],
): TId | null;

export {
  type EditorCommandDefinition,
  type EditorHotkeyEvent,
  type EditorHotkeyMap,
  formatEditorShortcutLabel,
  getEditorCommandIdFromKeyboardEvent,
  getEditorHotkeyConflicts,
  getEditorHotkeyFromKeyboardEvent,
  isEditorEditableTarget,
  matchesEditorHotkey,
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
  EditorClipboardFallback,
  EditorClipboardJsonOptions,
  EditorStorageAdapter,
  LocalStorageEditorStorageOptions,
  ReadEditorJsonFileOptions,
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
  EditorSnapshotHistoryCommandId,
  EditorSnapshotHistoryCommandRunContext,
  EditorSnapshotHistoryCommandsOptions,
  createEditorSnapshotHistoryCommands,
  defaultEditorSnapshotHistoryCommandHotkeys,
  defaultEditorSnapshotHistoryCommandLabels,
} from "./commands.js";
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
  formatEditorShortcutLabel,
  getEditorCommandIdFromKeyboardEvent,
  getEditorHotkeyConflicts,
  getEditorHotkeyFromKeyboardEvent,
  isEditorEditableTarget,
  matchesEditorHotkey,
  resolveEditorHotkeys,
} from "./hotkeys.js";
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
  decodeEditorSharePayload,
  editorShareTokenFromUrl,
  editorShareUrl,
  encodeEditorSharePayload,
} from "./share.js";
export {
  EditorTreeAdapter,
  EditorTreeItem,
  EditorTreeNode,
  EditorTreeNodeId,
  EditorTreePath,
  EditorTreePathSegment,
  EditorTreeProjection,
  EditorTreeState,
  ProjectEditorTreeOptions,
  collapseEditorTreeNode,
  createEditorTreeState,
  expandEditorTreeNode,
  projectEditorTree,
  selectEditorTreeNode,
  toggleEditorTreeNode,
} from "./tree.js";
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

## react.d.ts

```ts
import * as React from "react";
import { EditorCommandDefinition } from "./hotkeys.js";
import { EditorTreeState, EditorTreeNodeId } from "./tree.js";

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
  type UseEditorTreeStateResult,
  useControllableEditorState,
  useEditorHotkeys,
  useEditorTreeState,
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
declare function editorShareTokenFromUrl(url: string, param?: string): string | null;
declare function editorShareUrl(
  origin: string,
  path: string,
  token: string,
  param?: string,
): string;
declare function encodeEditorSharePayload(payload: unknown): Promise<string>;
declare function decodeEditorSharePayload<T = unknown>(token: string): Promise<T>;

export {
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

export {
  type EditorTreeAdapter,
  type EditorTreeItem,
  type EditorTreeNode,
  type EditorTreeNodeId,
  type EditorTreePath,
  type EditorTreePathSegment,
  type EditorTreeProjection,
  type EditorTreeState,
  type ProjectEditorTreeOptions,
  collapseEditorTreeNode,
  createEditorTreeState,
  expandEditorTreeNode,
  projectEditorTree,
  selectEditorTreeNode,
  toggleEditorTreeNode,
};
```
