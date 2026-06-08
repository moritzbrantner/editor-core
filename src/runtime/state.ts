import {
  resolveEditorAspects,
  type EditorAspectDefinition,
  type EditorAspectSnapshot,
  type EditorChangeOrigin,
} from "../aspects.js";
import {
  commitEditorSnapshotHistory,
  createEditorSnapshotHistory,
  redoEditorSnapshotHistory,
  resetEditorSnapshotHistory,
  undoEditorSnapshotHistory,
  type EditorSnapshotHistory,
} from "../history.js";
import type {
  CommitEditorRuntimeOptions,
  EditorRuntimeOptions,
  EditorRuntimeSelection,
  EditorRuntimeState,
  EditorRuntimeStateOptions,
  EditorRuntimeStatus,
  EditorRuntimeUpdate,
  EditorRuntimeUpdateContext,
  ResetEditorRuntimeOptions,
} from "./types.js";
import { validateRuntimeDocument } from "./validation.js";

const editorRuntimeOptionsByState = new WeakMap<object, EditorRuntimeStateOptions<unknown>>();
const noEditorRuntimeAspects: readonly EditorAspectDefinition<unknown, unknown>[] = [];

export function createEditorRuntime<TDocument, TSelection = unknown>(
  options: EditorRuntimeOptions<TDocument, TSelection>,
): EditorRuntimeState<TDocument, TSelection> {
  const history = createEditorSnapshotHistory(options.initialDocument, options.history);
  const runtimeOptions = toRuntimeStateOptions(options);
  const aspectSnapshot = resolveRuntimeAspects(history.present, runtimeOptions, 0, options.origin);

  return withRuntimeFlags(
    {
      aspectSnapshot,
      history,
      document: history.present,
      issues: validateRuntimeDocument(history.present, runtimeOptions),
      origin: options.origin,
      revision: 0,
      savedRevision: 0,
      selection: options.initialSelection ?? null,
    },
    runtimeOptions,
  );
}

export function commitEditorRuntime<TDocument, TSelection = unknown>(
  state: EditorRuntimeState<TDocument, TSelection>,
  update: EditorRuntimeUpdate<TDocument, TSelection>,
  options: CommitEditorRuntimeOptions<TSelection> = {},
): EditorRuntimeState<TDocument, TSelection> {
  const document = resolveRuntimeUpdate(state, update);
  const runtimeOptions = getRuntimeStateOptions(state);
  const history = commitEditorSnapshotHistory(state.history, document, runtimeOptions.history);
  const documentChanged = !runtimeDocumentsEqual(
    state.history.present,
    history.present,
    runtimeOptions,
  );
  const selection = options.selection !== undefined ? options.selection : state.selection;
  const selectionChanged = selection !== state.selection;

  if (!documentChanged && !selectionChanged) {
    return withRuntimeFlags(
      {
        ...state,
        history,
        origin: options.origin ?? state.origin,
        savedRevision: options.markSaved ? state.revision : state.savedRevision,
      },
      runtimeOptions,
    );
  }

  const revision = documentChanged ? state.revision + 1 : state.revision;
  const savedRevision = options.markSaved ? revision : state.savedRevision;

  return rebuildEditorRuntimeState(state, {
    history,
    origin: options.origin ?? state.origin,
    revision,
    savedRevision,
    selection,
  });
}

export function undoEditorRuntime<TDocument, TSelection = unknown>(
  state: EditorRuntimeState<TDocument, TSelection>,
  options: { origin?: EditorChangeOrigin } = {},
): EditorRuntimeState<TDocument, TSelection> {
  const history = undoEditorSnapshotHistory(state.history);
  if (history.present === state.history.present) {
    return withRuntimeFlags(
      {
        ...state,
        history,
        origin: options.origin ?? state.origin,
      },
      getRuntimeStateOptions(state),
    );
  }

  return rebuildEditorRuntimeState(state, {
    history,
    origin: options.origin ?? state.origin,
    revision: state.revision + 1,
    savedRevision: state.savedRevision,
    selection: state.selection,
  });
}

export function redoEditorRuntime<TDocument, TSelection = unknown>(
  state: EditorRuntimeState<TDocument, TSelection>,
  options: { origin?: EditorChangeOrigin } = {},
): EditorRuntimeState<TDocument, TSelection> {
  const history = redoEditorSnapshotHistory(state.history);
  if (history.present === state.history.present) {
    return withRuntimeFlags(
      {
        ...state,
        history,
        origin: options.origin ?? state.origin,
      },
      getRuntimeStateOptions(state),
    );
  }

  return rebuildEditorRuntimeState(state, {
    history,
    origin: options.origin ?? state.origin,
    revision: state.revision + 1,
    savedRevision: state.savedRevision,
    selection: state.selection,
  });
}

export function resetEditorRuntime<TDocument, TSelection = unknown>(
  state: EditorRuntimeState<TDocument, TSelection>,
  document: TDocument,
  options: ResetEditorRuntimeOptions<TSelection> = {},
): EditorRuntimeState<TDocument, TSelection> {
  const runtimeOptions = getRuntimeStateOptions(state);
  const history = resetEditorSnapshotHistory(document, runtimeOptions.history);
  const documentChanged = !runtimeDocumentsEqual(
    state.history.present,
    history.present,
    runtimeOptions,
  );
  const selection = options.selection !== undefined ? options.selection : state.selection;
  const revision = documentChanged ? state.revision + 1 : state.revision;
  const savedRevision = options.markSaved ? revision : state.savedRevision;

  return rebuildEditorRuntimeState(state, {
    history,
    origin: options.origin ?? state.origin,
    revision,
    savedRevision,
    selection,
  });
}

export function markEditorRuntimeSaved<TDocument, TSelection = unknown>(
  state: EditorRuntimeState<TDocument, TSelection>,
): EditorRuntimeState<TDocument, TSelection> {
  return withRuntimeFlags(
    {
      ...state,
      savedRevision: state.revision,
    },
    getRuntimeStateOptions(state),
  );
}

export function setEditorRuntimeSelection<TDocument, TSelection = unknown>(
  state: EditorRuntimeState<TDocument, TSelection>,
  selection: EditorRuntimeSelection<TSelection>,
): EditorRuntimeState<TDocument, TSelection> {
  return withRuntimeFlags(
    {
      ...state,
      selection,
    },
    getRuntimeStateOptions(state),
  );
}

export function validateEditorRuntime<TDocument, TSelection = unknown>(
  state: EditorRuntimeState<TDocument, TSelection>,
): EditorRuntimeState<TDocument, TSelection> {
  const runtimeOptions = getRuntimeStateOptions(state);
  return withRuntimeFlags(
    {
      ...state,
      issues: validateRuntimeDocument(state.document, runtimeOptions),
    },
    runtimeOptions,
  );
}

function resolveRuntimeUpdate<TDocument, TSelection>(
  state: EditorRuntimeState<TDocument, TSelection>,
  update: EditorRuntimeUpdate<TDocument, TSelection>,
): TDocument {
  if (typeof update === "function") {
    return (update as (context: EditorRuntimeUpdateContext<TDocument, TSelection>) => TDocument)({
      document: state.document,
      revision: state.revision,
      selection: state.selection,
    });
  }

  return update;
}

function rebuildEditorRuntimeState<TDocument, TSelection>(
  state: EditorRuntimeState<TDocument, TSelection>,
  next: {
    history: EditorSnapshotHistory<TDocument>;
    origin?: EditorChangeOrigin;
    revision: number;
    savedRevision: number;
    selection: EditorRuntimeSelection<TSelection>;
  },
): EditorRuntimeState<TDocument, TSelection> {
  const runtimeOptions = getRuntimeStateOptions(state);
  return withRuntimeFlags(
    {
      aspectSnapshot: resolveRuntimeAspects(
        next.history.present,
        runtimeOptions,
        next.revision,
        next.origin,
        state.aspectSnapshot,
      ),
      history: next.history,
      document: next.history.present,
      issues: validateRuntimeDocument(next.history.present, runtimeOptions),
      origin: next.origin,
      revision: next.revision,
      savedRevision: next.savedRevision,
      selection: next.selection,
    },
    runtimeOptions,
  );
}

function toRuntimeStateOptions<TDocument, TSelection>(
  options: EditorRuntimeOptions<TDocument, TSelection>,
): EditorRuntimeStateOptions<TDocument, TSelection> {
  return {
    aspects: options.aspects,
    history: options.history,
    origin: options.origin,
    validate: options.validate,
  };
}

function resolveRuntimeAspects<TDocument>(
  document: TDocument,
  options: Pick<EditorRuntimeOptions<TDocument>, "aspects">,
  revision: number,
  origin?: EditorChangeOrigin,
  previous?: EditorAspectSnapshot<TDocument>,
): EditorAspectSnapshot<TDocument> {
  return resolveEditorAspects(document, options.aspects ?? noEditorRuntimeAspects, {
    origin,
    previous,
    revision,
  });
}

function runtimeDocumentsEqual<TDocument>(
  left: TDocument,
  right: TDocument,
  options: Pick<EditorRuntimeOptions<TDocument>, "history">,
): boolean {
  return (options.history?.equals ?? Object.is)(left, right);
}

function withRuntimeFlags<TDocument, TSelection>(
  state: Omit<EditorRuntimeState<TDocument, TSelection>, "canRedo" | "canUndo" | "status">,
  options: EditorRuntimeStateOptions<TDocument, TSelection>,
): EditorRuntimeState<TDocument, TSelection> {
  const status: EditorRuntimeStatus = state.revision === state.savedRevision ? "clean" : "dirty";
  const runtime = {
    ...state,
    canRedo: state.history.canRedo,
    canUndo: state.history.canUndo,
    status,
  };
  editorRuntimeOptionsByState.set(runtime, options as EditorRuntimeStateOptions<unknown>);
  return runtime;
}

function getRuntimeStateOptions<TDocument, TSelection>(
  state: EditorRuntimeState<TDocument, TSelection>,
): EditorRuntimeStateOptions<TDocument, TSelection> {
  const options = editorRuntimeOptionsByState.get(state);
  if (!options) {
    throw new Error("Editor runtime state must be created by createEditorRuntime.");
  }

  return options as EditorRuntimeStateOptions<TDocument, TSelection>;
}
