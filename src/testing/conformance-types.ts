export type EditorFamilyConformanceDiagnostic = {
  path: string;
  message: string;
};

export type EditorFamilyConformanceParseResult<TDocument> =
  | { status: "success"; document: TDocument }
  | { status: "failure"; diagnostics: readonly EditorFamilyConformanceDiagnostic[] };

export type EditorFamilyConformanceInteractionKind = "drag" | "resize";

export type EditorFamilyConformanceAdapter<TDocument, TSelection, TRuntime> = {
  id: string;
  fixtures: {
    initialDocument: TDocument;
    equivalentDocument: TDocument;
    editedDocument: TDocument;
    customDataDocument: TDocument;
    initialSelection: TSelection;
    editedSelection: TSelection;
    invalidImport: unknown;
    migration: { input: unknown; expectedDocument: TDocument };
  };
  normalize: (document: TDocument) => TDocument | Promise<TDocument>;
  serialize: (document: TDocument) => unknown | Promise<unknown>;
  parseAndMigrate: (
    input: unknown,
  ) =>
    | EditorFamilyConformanceParseResult<TDocument>
    | Promise<EditorFamilyConformanceParseResult<TDocument>>;
  documentsEqual: (left: TDocument, right: TDocument) => boolean;
  selectionsEqual: (left: TSelection | null, right: TSelection | null) => boolean;
  createRuntime: (document: TDocument, selection: TSelection) => TRuntime | Promise<TRuntime>;
  getDocument: (runtime: TRuntime) => TDocument;
  getSelection: (runtime: TRuntime) => TSelection | null;
  edit: (
    runtime: TRuntime,
    document: TDocument,
    selection: TSelection,
  ) => TRuntime | Promise<TRuntime>;
  setSelection: (runtime: TRuntime, selection: TSelection) => TRuntime | Promise<TRuntime>;
  undo: (runtime: TRuntime) => TRuntime | Promise<TRuntime>;
  redo: (runtime: TRuntime) => TRuntime | Promise<TRuntime>;
  markSaved: (runtime: TRuntime) => TRuntime | Promise<TRuntime>;
  isDirty: (runtime: TRuntime) => boolean;
  canUndo: (runtime: TRuntime) => boolean;
  runMutationCommand: (
    runtime: TRuntime,
    options: { readOnly: boolean },
  ) => TRuntime | Promise<TRuntime>;
  cancelInteraction: (
    runtime: TRuntime,
    kind: EditorFamilyConformanceInteractionKind,
  ) => TRuntime | Promise<TRuntime>;
};

export type EditorFamilyConformanceCaseId =
  | "normalization-idempotent"
  | "serialization-roundtrip"
  | "migration-roundtrip"
  | "invalid-import-diagnostics"
  | "custom-data-preserved"
  | "history-restores-document-and-selection"
  | "read-only-command-does-not-mutate"
  | "dirty-state-follows-semantic-edits"
  | "cancelled-drag-does-not-enter-history"
  | "cancelled-resize-does-not-enter-history";

export type EditorFamilyConformanceCaseResult =
  | { id: EditorFamilyConformanceCaseId; status: "passed" }
  | { id: EditorFamilyConformanceCaseId; status: "failed"; message: string };

export type EditorFamilyConformanceReport = {
  adapterId: string;
  ok: boolean;
  cases: readonly EditorFamilyConformanceCaseResult[];
};
