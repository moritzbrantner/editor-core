import { createStableEditorJsonEquals, stableEditorJsonStringify } from "./json.js";

export type EditorConformanceCapability =
  | "transition"
  | "normalization"
  | "history"
  | "serialization"
  | "migration"
  | "persistence";

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

export type EditorConformanceRoundtripCase<TDocument> = {
  document: TDocument;
  name?: string;
};

export type EditorConformanceRoundtripAdapter<TDocument, TSerialized> = {
  serialize: (document: TDocument) => TSerialized;
  parse: (serialized: TSerialized) => TDocument;
  cases?: readonly EditorConformanceRoundtripCase<TDocument>[];
};

export type EditorConformanceNormalizationAdapter<TDocument> = {
  normalize: (document: TDocument) => TDocument;
};

export type EditorConformanceMigrationCase<TDocument, TSerialized> = {
  input: TSerialized;
  expectedDocument: TDocument;
  name?: string;
};

export type EditorConformanceMigrationAdapter<TDocument, TSerialized> = {
  cases: readonly EditorConformanceMigrationCase<TDocument, TSerialized>[];
  migrate: (input: TSerialized) => TSerialized;
  parse: (serialized: TSerialized) => TDocument;
};

export type EditorConformanceSuite<
  TDocument,
  TAction,
  THistory = never,
  TSerialized = never,
  TPersisted = never,
  TSelection = never,
> = {
  createDocument: () => TDocument;
  actions: readonly TAction[];
  apply: (document: TDocument, action: TAction) => TDocument;
  normalization?: EditorConformanceNormalizationAdapter<TDocument>;
  history?: EditorConformanceHistoryAdapter<TDocument, TAction, THistory, TSelection>;
  serialization?: EditorConformanceRoundtripAdapter<TDocument, TSerialized>;
  migration?: EditorConformanceMigrationAdapter<TDocument, TSerialized>;
  persistence?: EditorConformanceRoundtripAdapter<TDocument, TPersisted>;
  equals?: (left: TDocument, right: TDocument) => boolean;
};

export class EditorConformanceError extends Error {
  readonly issues: readonly EditorConformanceIssue[];

  constructor(issues: readonly EditorConformanceIssue[]) {
    super(formatEditorConformanceIssues(issues));
    this.name = "EditorConformanceError";
    this.issues = issues;
  }
}

export function checkEditorConformanceSuite<
  TDocument,
  TAction,
  THistory = never,
  TSerialized = never,
  TPersisted = never,
  TSelection = never,
>(
  suite: EditorConformanceSuite<TDocument, TAction, THistory, TSerialized, TPersisted, TSelection>,
): EditorConformanceResult {
  const issues: EditorConformanceIssue[] = [];
  const equals = suite.equals ?? createStableEditorJsonEquals<TDocument>();
  const firstInitial = suite.createDocument();
  const firstInitialSnapshot = stableEditorJsonStringify(firstInitial);
  const firstFinal = applySequence(firstInitial, suite.actions, suite.apply);
  const secondInitial = suite.createDocument();
  const secondFinal = applySequence(secondInitial, suite.actions, suite.apply);

  if (!equals(firstFinal, secondFinal)) {
    issues.push({
      capability: "transition",
      message: `Applying the same action sequence produced different results: ${stableEditorJsonStringify(firstFinal)} vs ${stableEditorJsonStringify(secondFinal)}.`,
    });
  }

  if (stableEditorJsonStringify(firstInitial) !== firstInitialSnapshot) {
    issues.push({
      capability: "transition",
      message: "Applying the action sequence mutated the original document in place.",
    });
  }

  if (suite.normalization) {
    checkNormalizationConformance(firstFinal, suite.normalization, equals, issues);
  }

  if (suite.history && suite.actions.length > 0) {
    checkHistoryConformance(suite, firstFinal, equals, issues);
  }

  if (suite.serialization) {
    checkRoundtrip("serialization", firstFinal, suite.serialization, equals, issues);
  }

  if (suite.migration) {
    checkMigrationConformance(suite.migration, equals, issues);
  }

  if (suite.persistence) {
    checkRoundtrip("persistence", firstFinal, suite.persistence, equals, issues);
  }

  return { ok: issues.length === 0, issues };
}

export function assertEditorConformanceSuite<
  TDocument,
  TAction,
  THistory = never,
  TSerialized = never,
  TPersisted = never,
  TSelection = never,
>(
  suite: EditorConformanceSuite<TDocument, TAction, THistory, TSerialized, TPersisted, TSelection>,
): void {
  const result = checkEditorConformanceSuite(suite);
  if (!result.ok) {
    throw new EditorConformanceError(result.issues);
  }
}

function applySequence<TDocument, TAction>(
  initialDocument: TDocument,
  actions: readonly TAction[],
  apply: (document: TDocument, action: TAction) => TDocument,
): TDocument {
  return actions.reduce((document, action) => apply(document, action), initialDocument);
}

function checkNormalizationConformance<TDocument>(
  document: TDocument,
  adapter: EditorConformanceNormalizationAdapter<TDocument>,
  equals: (left: TDocument, right: TDocument) => boolean,
  issues: EditorConformanceIssue[],
): void {
  const normalized = adapter.normalize(document);
  const normalizedSnapshot = stableEditorJsonStringify(normalized);
  const renormalized = adapter.normalize(normalized);

  if (
    !equals(normalized, renormalized) ||
    stableEditorJsonStringify(renormalized) !== normalizedSnapshot
  ) {
    issues.push({
      capability: "normalization",
      message: "Normalizing an already normalized document changed its semantic result.",
    });
  }
}

function checkHistoryConformance<TDocument, TAction, THistory, TSerialized, TPersisted, TSelection>(
  suite: EditorConformanceSuite<TDocument, TAction, THistory, TSerialized, TPersisted, TSelection>,
  expectedFinal: TDocument,
  equals: (left: TDocument, right: TDocument) => boolean,
  issues: EditorConformanceIssue[],
): void {
  const historyAdapter = suite.history;
  if (!historyAdapter) {
    return;
  }

  const expectedInitial = suite.createDocument();
  let history = historyAdapter.create(suite.createDocument());
  const initialSelectionFingerprint = getSelectionFingerprint(historyAdapter, history);

  for (const action of suite.actions) {
    history = historyAdapter.apply(history, action);
  }

  const finalSelectionFingerprint = getSelectionFingerprint(historyAdapter, history);

  if (!equals(historyAdapter.getDocument(history), expectedFinal)) {
    issues.push({
      capability: "history",
      message: "History-backed application does not match direct action application.",
    });
  }

  for (let index = 0; index < suite.actions.length; index += 1) {
    history = historyAdapter.undo(history);
  }

  if (!equals(historyAdapter.getDocument(history), expectedInitial)) {
    issues.push({
      capability: "history",
      message: "Undoing the complete action sequence did not restore the initial document.",
    });
  }

  if (
    initialSelectionFingerprint !== undefined &&
    getSelectionFingerprint(historyAdapter, history) !== initialSelectionFingerprint
  ) {
    issues.push({
      capability: "history",
      message: "Undoing the complete action sequence did not restore the initial selection.",
    });
  }

  for (let index = 0; index < suite.actions.length; index += 1) {
    history = historyAdapter.redo(history);
  }

  if (!equals(historyAdapter.getDocument(history), expectedFinal)) {
    issues.push({
      capability: "history",
      message: "Redoing the complete action sequence did not restore the final document.",
    });
  }

  if (
    finalSelectionFingerprint !== undefined &&
    getSelectionFingerprint(historyAdapter, history) !== finalSelectionFingerprint
  ) {
    issues.push({
      capability: "history",
      message: "Redoing the complete action sequence did not restore the final selection.",
    });
  }
}

function getSelectionFingerprint<TDocument, TAction, THistory, TSelection>(
  adapter: EditorConformanceHistoryAdapter<TDocument, TAction, THistory, TSelection>,
  history: THistory,
): string | undefined {
  if (!adapter.getSelection) {
    return undefined;
  }

  const selection = adapter.getSelection(history);
  return adapter.selectionFingerprint
    ? adapter.selectionFingerprint(selection)
    : `json:${stableEditorJsonStringify(selection)}`;
}

function checkMigrationConformance<TDocument, TSerialized>(
  adapter: EditorConformanceMigrationAdapter<TDocument, TSerialized>,
  equals: (left: TDocument, right: TDocument) => boolean,
  issues: EditorConformanceIssue[],
): void {
  for (const migrationCase of adapter.cases) {
    const migratedDocument = adapter.parse(adapter.migrate(migrationCase.input));
    if (!equals(migratedDocument, migrationCase.expectedDocument)) {
      issues.push({
        capability: "migration",
        message: `Migrating serialized input changed the expected document from ${stableEditorJsonStringify(migrationCase.expectedDocument)} to ${stableEditorJsonStringify(migratedDocument)}.`,
        ...(migrationCase.name ? { path: migrationCase.name } : {}),
      });
    }
  }
}

function checkRoundtrip<TDocument, TValue>(
  capability: "serialization" | "persistence",
  document: TDocument,
  adapter: EditorConformanceRoundtripAdapter<TDocument, TValue>,
  equals: (left: TDocument, right: TDocument) => boolean,
  issues: EditorConformanceIssue[],
): void {
  checkRoundtripDocument(capability, document, adapter, equals, issues);

  for (const roundtripCase of adapter.cases ?? []) {
    checkRoundtripDocument(
      capability,
      roundtripCase.document,
      adapter,
      equals,
      issues,
      roundtripCase.name,
    );
  }
}

function checkRoundtripDocument<TDocument, TValue>(
  capability: "serialization" | "persistence",
  document: TDocument,
  adapter: EditorConformanceRoundtripAdapter<TDocument, TValue>,
  equals: (left: TDocument, right: TDocument) => boolean,
  issues: EditorConformanceIssue[],
  path?: string,
): void {
  const roundtripped = adapter.parse(adapter.serialize(document));
  if (!equals(document, roundtripped)) {
    issues.push({
      capability,
      message: `${capability} roundtrip changed the document from ${stableEditorJsonStringify(document)} to ${stableEditorJsonStringify(roundtripped)}.`,
      ...(path ? { path } : {}),
    });
  }
}

function formatEditorConformanceIssues(issues: readonly EditorConformanceIssue[]): string {
  if (issues.length === 0) {
    return "Editor conformance failed.";
  }
  return issues.map((issue) => `${issue.capability}: ${issue.message}`).join("; ");
}
