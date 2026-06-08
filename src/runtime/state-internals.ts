import {
  resolveEditorAspects,
  type EditorAspectDefinition,
  type EditorAspectSnapshot,
  type EditorChangeOrigin,
} from "../aspects.js";
import type { EditorSnapshotHistory } from "../history.js";
import type {
  EditorRuntimeOptions,
  EditorRuntimeSelection,
  EditorRuntimeState,
  EditorRuntimeStateOptions,
  EditorRuntimeStatus,
} from "./types.js";
import { validateRuntimeDocument } from "./validation.js";

export const editorRuntimeOptionsByState = new WeakMap<
  object,
  EditorRuntimeStateOptions<unknown>
>();
export const noEditorRuntimeAspects: readonly EditorAspectDefinition<unknown, unknown>[] = [];

export function rebuildEditorRuntimeState<TDocument, TSelection>(
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

export function toRuntimeStateOptions<TDocument, TSelection>(
  options: EditorRuntimeOptions<TDocument, TSelection>,
): EditorRuntimeStateOptions<TDocument, TSelection> {
  return {
    aspects: options.aspects,
    history: options.history,
    origin: options.origin,
    validate: options.validate,
  };
}

export function resolveRuntimeAspects<TDocument>(
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

export function runtimeDocumentsEqual<TDocument>(
  left: TDocument,
  right: TDocument,
  options: Pick<EditorRuntimeOptions<TDocument>, "history">,
): boolean {
  return (options.history?.equals ?? Object.is)(left, right);
}

export function withRuntimeFlags<TDocument, TSelection>(
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

export function getRuntimeStateOptions<TDocument, TSelection>(
  state: EditorRuntimeState<TDocument, TSelection>,
): EditorRuntimeStateOptions<TDocument, TSelection> {
  const options = editorRuntimeOptionsByState.get(state);
  if (!options) {
    throw new Error("Editor runtime state must be created by createEditorRuntime.");
  }

  return options as EditorRuntimeStateOptions<TDocument, TSelection>;
}
