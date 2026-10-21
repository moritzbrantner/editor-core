// Shared types of the editor-family conformance suite.
export type EditorConformanceCapability =
  | "transition"
  | "normalization"
  | "history"
  | "serialization"
  | "migration"
  | "persistence"
  | "import"
  | "readOnly"
  | "dirtyState"
  | "interaction";

export type EditorConformanceIssue = {
  capability: EditorConformanceCapability;
  message: string;
  path?: string;
};

export type EditorConformanceResult = {
  ok: boolean;
  issues: readonly EditorConformanceIssue[];
};

export type EditorConformanceHistoryAdapter<TDocument, TAction, THistory, TSelection = never> = {
  create: (document: TDocument) => THistory;
  apply: (history: THistory, action: TAction) => THistory;
  undo: (history: THistory) => THistory;
  redo: (history: THistory) => THistory;
  getDocument: (history: THistory) => TDocument;
  getSelection?: (history: THistory) => TSelection;
  selectionFingerprint?: (selection: TSelection) => string;
};
