import { createStableEditorJsonEquals, stableEditorJsonStringify } from "./json.js";

export type EditorConformanceCapability =
  | "transition"
  | "history"
  | "serialization"
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

export type EditorConformanceHistoryAdapter<TDocument, TAction, THistory> = {
  create: (document: TDocument) => THistory;
  apply: (history: THistory, action: TAction) => THistory;
  undo: (history: THistory) => THistory;
  redo: (history: THistory) => THistory;
  getDocument: (history: THistory) => TDocument;
};

export type EditorConformanceRoundtripAdapter<TDocument, TSerialized> = {
  serialize: (document: TDocument) => TSerialized;
  parse: (serialized: TSerialized) => TDocument;
};

export type EditorConformanceSuite<
  TDocument,
  TAction,
  THistory = never,
  TSerialized = never,
  TPersisted = never,
> = {
  createDocument: () => TDocument;
  actions: readonly TAction[];
  apply: (document: TDocument, action: TAction) => TDocument;
  history?: EditorConformanceHistoryAdapter<TDocument, TAction, THistory>;
  serialization?: EditorConformanceRoundtripAdapter<TDocument, TSerialized>;
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
>(
  suite: EditorConformanceSuite<TDocument, TAction, THistory, TSerialized, TPersisted>,
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

  if (suite.history && suite.actions.length > 0) {
    checkHistoryConformance(suite, firstFinal, equals, issues);
  }

  if (suite.serialization) {
    checkRoundtrip("serialization", firstFinal, suite.serialization, equals, issues);
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
>(suite: EditorConformanceSuite<TDocument, TAction, THistory, TSerialized, TPersisted>): void {
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

function checkHistoryConformance<TDocument, TAction, THistory, TSerialized, TPersisted>(
  suite: EditorConformanceSuite<TDocument, TAction, THistory, TSerialized, TPersisted>,
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

  for (const action of suite.actions) {
    history = historyAdapter.apply(history, action);
  }

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

  for (let index = 0; index < suite.actions.length; index += 1) {
    history = historyAdapter.redo(history);
  }

  if (!equals(historyAdapter.getDocument(history), expectedFinal)) {
    issues.push({
      capability: "history",
      message: "Redoing the complete action sequence did not restore the final document.",
    });
  }
}

function checkRoundtrip<TDocument, TValue>(
  capability: "serialization" | "persistence",
  document: TDocument,
  adapter: EditorConformanceRoundtripAdapter<TDocument, TValue>,
  equals: (left: TDocument, right: TDocument) => boolean,
  issues: EditorConformanceIssue[],
): void {
  const roundtripped = adapter.parse(adapter.serialize(document));
  if (!equals(document, roundtripped)) {
    issues.push({
      capability,
      message: `${capability} roundtrip changed the document from ${stableEditorJsonStringify(document)} to ${stableEditorJsonStringify(roundtripped)}.`,
    });
  }
}

function formatEditorConformanceIssues(issues: readonly EditorConformanceIssue[]): string {
  if (issues.length === 0) {
    return "Editor conformance failed.";
  }
  return issues.map((issue) => `${issue.capability}: ${issue.message}`).join("; ");
}
