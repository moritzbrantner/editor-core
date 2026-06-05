export const defaultEditorHistoryLimit = 100;

export type EditorSnapshotHistory<TDocument> = {
  past: TDocument[];
  present: TDocument;
  future: TDocument[];
  canUndo: boolean;
  canRedo: boolean;
};

export type EditorSnapshotHistoryOptions<TDocument> = {
  limit?: number;
  normalize?: (document: TDocument) => TDocument;
  equals?: (left: TDocument, right: TDocument) => boolean;
};

export function createEditorSnapshotHistory<TDocument>(
  document: TDocument,
  options: EditorSnapshotHistoryOptions<TDocument> = {},
): EditorSnapshotHistory<TDocument> {
  return withSnapshotFlags({
    past: [],
    present: normalizeSnapshotDocument(document, options),
    future: [],
  });
}

export function commitEditorSnapshotHistory<TDocument>(
  history: EditorSnapshotHistory<TDocument>,
  document: TDocument,
  options: EditorSnapshotHistoryOptions<TDocument> = {},
): EditorSnapshotHistory<TDocument> {
  const nextDocument = normalizeSnapshotDocument(document, options);
  const equals = options.equals ?? Object.is;

  if (equals(history.present, nextDocument)) {
    return withSnapshotFlags(history);
  }

  const limit = normalizeHistoryLimit(options.limit);
  const past = limit === 0 ? [] : [...history.past, history.present].slice(-limit);

  return withSnapshotFlags({
    past,
    present: nextDocument,
    future: [],
  });
}

export function undoEditorSnapshotHistory<TDocument>(
  history: EditorSnapshotHistory<TDocument>,
): EditorSnapshotHistory<TDocument> {
  const previous = history.past.at(-1);
  if (previous === undefined) {
    return withSnapshotFlags(history);
  }

  return withSnapshotFlags({
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  });
}

export function redoEditorSnapshotHistory<TDocument>(
  history: EditorSnapshotHistory<TDocument>,
): EditorSnapshotHistory<TDocument> {
  const next = history.future.at(0);
  if (next === undefined) {
    return withSnapshotFlags(history);
  }

  return withSnapshotFlags({
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  });
}

export function resetEditorSnapshotHistory<TDocument>(
  document: TDocument,
  options: EditorSnapshotHistoryOptions<TDocument> = {},
): EditorSnapshotHistory<TDocument> {
  return createEditorSnapshotHistory(document, options);
}

export function canUndoEditorHistory<TDocument>(
  history: EditorSnapshotHistory<TDocument>,
): boolean {
  return history.past.length > 0;
}

export function canRedoEditorHistory<TDocument>(
  history: EditorSnapshotHistory<TDocument>,
): boolean {
  return history.future.length > 0;
}

export type EditorTransaction<TDocument, TSelection = unknown> = {
  id: string;
  label?: string;
  before: TDocument;
  after: TDocument;
  selectionBefore?: TSelection;
  selectionAfter?: TSelection;
};

export type EditorTransactionHistory<TDocument, TSelection = unknown> = {
  undoStack: Array<EditorTransaction<TDocument, TSelection>>;
  redoStack: Array<EditorTransaction<TDocument, TSelection>>;
};

export type EditorTransactionHistoryResult<TDocument, TSelection = unknown> = {
  history: EditorTransactionHistory<TDocument, TSelection>;
  document?: TDocument;
  selection?: TSelection;
  transaction?: EditorTransaction<TDocument, TSelection>;
};

export function createEditorTransactionHistory<
  TDocument,
  TSelection = unknown,
>(): EditorTransactionHistory<TDocument, TSelection> {
  return {
    undoStack: [],
    redoStack: [],
  };
}

export function pushEditorTransactionHistory<TDocument, TSelection = unknown>(
  history: EditorTransactionHistory<TDocument, TSelection>,
  transaction: EditorTransaction<TDocument, TSelection>,
  options: { limit?: number } = {},
): EditorTransactionHistory<TDocument, TSelection> {
  const limit = normalizeHistoryLimit(options.limit);
  const undoStack = limit === 0 ? [] : [...history.undoStack, transaction].slice(-limit);

  return {
    undoStack,
    redoStack: [],
  };
}

export function undoEditorTransactionHistory<TDocument, TSelection = unknown>(
  history: EditorTransactionHistory<TDocument, TSelection>,
  fallbackSelection?: TSelection,
): EditorTransactionHistoryResult<TDocument, TSelection> {
  const transaction = history.undoStack.at(-1);
  if (!transaction) {
    return { history };
  }

  return {
    document: transaction.before,
    history: {
      undoStack: history.undoStack.slice(0, -1),
      redoStack: [...history.redoStack, transaction],
    },
    selection: transaction.selectionBefore ?? fallbackSelection,
    transaction,
  };
}

export function redoEditorTransactionHistory<TDocument, TSelection = unknown>(
  history: EditorTransactionHistory<TDocument, TSelection>,
  fallbackSelection?: TSelection,
): EditorTransactionHistoryResult<TDocument, TSelection> {
  const transaction = history.redoStack.at(-1);
  if (!transaction) {
    return { history };
  }

  return {
    document: transaction.after,
    history: {
      undoStack: [...history.undoStack, transaction],
      redoStack: history.redoStack.slice(0, -1),
    },
    selection: transaction.selectionAfter ?? fallbackSelection,
    transaction,
  };
}

function normalizeSnapshotDocument<TDocument>(
  document: TDocument,
  options: EditorSnapshotHistoryOptions<TDocument>,
) {
  return options.normalize ? options.normalize(document) : document;
}

function normalizeHistoryLimit(limit: number | undefined) {
  return Math.max(0, Math.trunc(limit ?? defaultEditorHistoryLimit));
}

function withSnapshotFlags<TDocument>(history: {
  past: TDocument[];
  present: TDocument;
  future: TDocument[];
}): EditorSnapshotHistory<TDocument> {
  return {
    ...history,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
