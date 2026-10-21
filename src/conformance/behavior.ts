// Read-only, dirty-state and cancelled-interaction checks of the editor-family conformance suite.
import { stableEditorJsonStringify } from "../json.js";
import type { EditorConformanceHistoryAdapter, EditorConformanceIssue } from "./types.js";

/**
 * Executes the consumer's registered commands while the editor is read-only. Every suite action
 * must leave the document semantically and physically unchanged.
 */
export type EditorConformanceReadOnlyAdapter<TDocument, TAction> = {
  execute: (document: TDocument, action: TAction) => TDocument;
};

/**
 * The consumer's dirty/saved state. Dirty may change only through a semantic document edit:
 * a suite action that leaves the document semantically unchanged must keep the flag, an edit
 * must set it, and `markSaved` must clear it.
 */
export type EditorConformanceDirtyStateAdapter<TDocument, TAction, TState> = {
  create: (document: TDocument) => TState;
  apply: (state: TState, action: TAction) => TState;
  markSaved: (state: TState) => TState;
  isDirty: (state: TState) => boolean;
  getDocument: (state: TState) => TDocument;
};

/** A drag, resize or other interaction that starts and is cancelled on top of a history. */
export type EditorConformanceCancelledInteractionCase<THistory> = {
  cancel: (history: THistory) => THistory;
  name?: string;
};

export type EditorConformanceInteractionAdapter<THistory> = {
  cancelled: readonly EditorConformanceCancelledInteractionCase<THistory>[];
};

export function checkReadOnlyConformance<TDocument, TAction>(
  suite: { createDocument: () => TDocument; actions: readonly TAction[] },
  adapter: EditorConformanceReadOnlyAdapter<TDocument, TAction>,
  equals: (left: TDocument, right: TDocument) => boolean,
  issues: EditorConformanceIssue[],
): void {
  suite.actions.forEach((action, index) => {
    const document = suite.createDocument();
    const snapshot = stableEditorJsonStringify(document);
    const result = adapter.execute(document, action);
    if (!equals(document, result)) {
      issues.push({
        capability: "readOnly",
        message: `A command changed the read-only document from ${snapshot} to ${stableEditorJsonStringify(result)}.`,
        path: `actions[${index}]`,
      });
    }
    if (stableEditorJsonStringify(document) !== snapshot) {
      issues.push({
        capability: "readOnly",
        message: "A command mutated the read-only document in place.",
        path: `actions[${index}]`,
      });
    }
  });
}

export function checkDirtyStateConformance<TDocument, TAction, TState>(
  suite: { createDocument: () => TDocument; actions: readonly TAction[] },
  adapter: EditorConformanceDirtyStateAdapter<TDocument, TAction, TState>,
  equals: (left: TDocument, right: TDocument) => boolean,
  issues: EditorConformanceIssue[],
): void {
  let state = adapter.create(suite.createDocument());
  if (adapter.isDirty(state)) {
    issues.push({ capability: "dirtyState", message: "A new editor state starts dirty." });
  }

  suite.actions.forEach((action, index) => {
    const before = adapter.getDocument(state);
    const wasDirty = adapter.isDirty(state);
    state = adapter.apply(state, action);
    const edited = !equals(before, adapter.getDocument(state));
    const dirty = adapter.isDirty(state);
    if (edited && !dirty) {
      issues.push({
        capability: "dirtyState",
        message: "A semantic document edit did not mark the state dirty.",
        path: `actions[${index}]`,
      });
    }
    if (!edited && dirty !== wasDirty) {
      issues.push({
        capability: "dirtyState",
        message: `An action without a semantic document edit changed dirty from ${String(wasDirty)} to ${String(dirty)}.`,
        path: `actions[${index}]`,
      });
    }
  });

  state = adapter.markSaved(state);
  if (adapter.isDirty(state)) {
    issues.push({ capability: "dirtyState", message: "Marking the state saved left it dirty." });
  }
}

export function checkInteractionConformance<TDocument, TAction, THistory, TSelection>(
  suite: {
    createDocument: () => TDocument;
    actions: readonly TAction[];
    history?: EditorConformanceHistoryAdapter<TDocument, TAction, THistory, TSelection> | undefined;
  },
  adapter: EditorConformanceInteractionAdapter<THistory>,
  equals: (left: TDocument, right: TDocument) => boolean,
  issues: EditorConformanceIssue[],
): void {
  const historyAdapter = suite.history;
  if (!historyAdapter) {
    issues.push({
      capability: "interaction",
      message: "Cancelled-interaction checks need a history adapter.",
    });
    return;
  }
  const settled = suite.actions.reduce(
    (history, action) => historyAdapter.apply(history, action),
    historyAdapter.create(suite.createDocument()),
  );
  const settledDocument = historyAdapter.getDocument(settled);
  const undoneDocument = historyAdapter.getDocument(historyAdapter.undo(settled));

  for (const interaction of adapter.cancelled) {
    const cancelled = interaction.cancel(settled);
    const path = interaction.name;
    if (!equals(historyAdapter.getDocument(cancelled), settledDocument)) {
      issues.push({
        capability: "interaction",
        message: "A cancelled interaction changed the document.",
        ...(path ? { path } : {}),
      });
    }
    if (!equals(historyAdapter.getDocument(historyAdapter.undo(cancelled)), undoneDocument)) {
      issues.push({
        capability: "interaction",
        message: "A cancelled interaction entered history: undo no longer reverts the last action.",
        ...(path ? { path } : {}),
      });
    }
  }
}
