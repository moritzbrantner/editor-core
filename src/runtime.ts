import {
  resolveEditorAspects,
  type EditorAspectDefinition,
  type EditorAspectSnapshot,
  type EditorChangeOrigin,
} from "./aspects.js";
import type { EditorCommandDefinition, EditorHotkeyMap } from "./hotkeys.js";
import {
  commitEditorSnapshotHistory,
  createEditorSnapshotHistory,
  redoEditorSnapshotHistory,
  resetEditorSnapshotHistory,
  undoEditorSnapshotHistory,
  type EditorSnapshotHistory,
  type EditorSnapshotHistoryOptions,
} from "./history.js";
import type { EditorParseIssue } from "./serialization.js";

export type EditorRuntimeStatus = "clean" | "dirty";

export type EditorRuntimeSelection<TSelection = unknown> = TSelection | null;

export type EditorRuntimeUpdateContext<TDocument, TSelection = unknown> = {
  document: TDocument;
  selection: EditorRuntimeSelection<TSelection>;
  revision: number;
};

export type EditorRuntimeUpdate<TDocument, TSelection = unknown> =
  | TDocument
  | ((context: EditorRuntimeUpdateContext<TDocument, TSelection>) => TDocument);

export type EditorRuntimeValidationIssue = EditorParseIssue;

export type EditorRuntimeValidator<TDocument> = (
  document: TDocument,
) => readonly EditorRuntimeValidationIssue[];

export type EditorRuntimeOptions<TDocument, TSelection = unknown> = {
  initialDocument: TDocument;
  initialSelection?: EditorRuntimeSelection<TSelection>;
  history?: EditorSnapshotHistoryOptions<TDocument>;
  validate?: EditorRuntimeValidator<TDocument>;
  aspects?: readonly EditorAspectDefinition<TDocument, unknown>[];
  origin?: EditorChangeOrigin;
};

type EditorRuntimeStateOptions<TDocument, TSelection = unknown> = Omit<
  EditorRuntimeOptions<TDocument, TSelection>,
  "initialDocument" | "initialSelection"
>;

const editorRuntimeOptionsByState = new WeakMap<object, EditorRuntimeStateOptions<unknown>>();

export type EditorRuntimeState<TDocument, TSelection = unknown> = {
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

export type CommitEditorRuntimeOptions<TSelection = unknown> = {
  selection?: EditorRuntimeSelection<TSelection>;
  origin?: EditorChangeOrigin;
  markSaved?: boolean;
};

export type ResetEditorRuntimeOptions<TSelection = unknown> = {
  selection?: EditorRuntimeSelection<TSelection>;
  origin?: EditorChangeOrigin;
  markSaved?: boolean;
};

export type EditorRuntimeCommandId = "undo" | "redo" | "reset" | "save";

export const defaultEditorRuntimeCommandHotkeys: EditorHotkeyMap<EditorRuntimeCommandId> = {
  redo: ["Mod+Shift+Z"],
  reset: ["Mod+Backspace"],
  save: ["Mod+Alt+S"],
  undo: ["Mod+Z"],
};

export const defaultEditorRuntimeCommandLabels: Record<EditorRuntimeCommandId, string> = {
  redo: "Redo",
  reset: "Reset",
  save: "Save",
  undo: "Undo",
};

export type EditorRuntimeCommandsOptions<TDocument, TSelection = unknown> = {
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

const defaultEditorRuntimeCommandOrder: readonly EditorRuntimeCommandId[] = [
  "undo",
  "redo",
  "reset",
  "save",
];

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

export function createEditorRuntimeCommands<TDocument, TSelection = unknown>(
  options: EditorRuntimeCommandsOptions<TDocument, TSelection>,
): readonly EditorCommandDefinition<EditorRuntimeCommandId>[] {
  const include = options.include ?? defaultEditorRuntimeCommandOrder;

  return include.map((id) => {
    const disabled = isEditorRuntimeCommandDisabled(id, options);

    return {
      disabled,
      hotkeys: options.hotkeys?.[id] ?? defaultEditorRuntimeCommandHotkeys[id],
      id,
      label: options.labels?.[id] ?? defaultEditorRuntimeCommandLabels[id],
      run: async () => {
        if (disabled) {
          return;
        }

        if (id === "undo") {
          options.setRuntime(undoEditorRuntime);
          return;
        }

        if (id === "redo") {
          options.setRuntime(redoEditorRuntime);
          return;
        }

        if (id === "reset") {
          options.setRuntime((runtime) =>
            resetEditorRuntime(runtime, options.getResetDocument(), { markSaved: true }),
          );
          return;
        }

        if (options.onSave) {
          await options.onSave(options.runtime);
        }
        options.setRuntime(markEditorRuntimeSaved);
      },
    };
  });
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

function validateRuntimeDocument<TDocument>(
  document: TDocument,
  options: Pick<EditorRuntimeOptions<TDocument>, "validate">,
): readonly EditorRuntimeValidationIssue[] {
  return options.validate?.(document) ?? [];
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

function isEditorRuntimeCommandDisabled<TDocument, TSelection>(
  id: EditorRuntimeCommandId,
  options: EditorRuntimeCommandsOptions<TDocument, TSelection>,
): boolean {
  if (hasEditorRuntimeDisabledOverride(id, options.disabled)) {
    return options.disabled[id] === true;
  }

  if (id === "undo") {
    return !options.runtime.canUndo;
  }

  if (id === "redo") {
    return !options.runtime.canRedo;
  }

  if (id === "save") {
    return options.runtime.status === "clean";
  }

  return false;
}

function hasEditorRuntimeDisabledOverride(
  id: EditorRuntimeCommandId,
  disabled: Partial<Record<EditorRuntimeCommandId, boolean>> | undefined,
): disabled is Partial<Record<EditorRuntimeCommandId, boolean>> {
  return disabled ? Object.hasOwn(disabled, id) : false;
}
