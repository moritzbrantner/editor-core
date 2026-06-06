import type { EditorEntityId, EditorPoint } from "./entities.js";
import {
  applyEditorOperation,
  type EditorOperation,
  type EditorOperationRuntimeState,
} from "./operations.js";

export type EditorInteractionState =
  | { kind: "idle" }
  | { kind: "dragging"; ids: readonly EditorEntityId[]; origin: EditorPoint }
  | { kind: "resizing"; id: EditorEntityId; handle: string }
  | { kind: "connecting"; fromId: EditorEntityId; fromPortId?: string }
  | { kind: "scrubbing"; time: number };

export type EditorInteractionSession<
  TDocument,
  TInteraction extends EditorInteractionState = EditorInteractionState,
> = {
  committedDocument: TDocument;
  previewDocument: TDocument;
  state: TInteraction;
};

export const idleEditorInteraction: EditorInteractionState = { kind: "idle" };

export function createEditorInteractionSession<TDocument>(
  document: TDocument,
): EditorInteractionSession<TDocument> {
  return {
    committedDocument: document,
    previewDocument: document,
    state: idleEditorInteraction,
  };
}

export function beginEditorInteraction<TDocument, TInteraction extends EditorInteractionState>(
  session: EditorInteractionSession<TDocument>,
  state: TInteraction,
): EditorInteractionSession<TDocument, TInteraction> {
  return {
    committedDocument: session.committedDocument,
    previewDocument: session.committedDocument,
    state,
  };
}

export function updateEditorInteractionPreview<
  TDocument,
  TInteraction extends EditorInteractionState,
>(
  session: EditorInteractionSession<TDocument, TInteraction>,
  previewDocument: TDocument,
): EditorInteractionSession<TDocument, TInteraction> {
  return {
    ...session,
    previewDocument,
  };
}

export function cancelEditorInteraction<TDocument>(
  session: EditorInteractionSession<TDocument>,
): EditorInteractionSession<TDocument> {
  return createEditorInteractionSession(session.committedDocument);
}

export function commitEditorInteraction<TDocument>(
  session: EditorInteractionSession<TDocument>,
): EditorInteractionSession<TDocument> {
  return createEditorInteractionSession(session.previewDocument);
}

export function commitEditorInteractionOperation<TDocument, TSelection = unknown>(
  runtime: EditorOperationRuntimeState<TDocument, TSelection>,
  operation: EditorOperation<TDocument, TSelection>,
): EditorOperationRuntimeState<TDocument, TSelection> {
  return applyEditorOperation(runtime, operation, { merge: true });
}

export function isEditorInteractionActive(state: EditorInteractionState): boolean {
  return state.kind !== "idle";
}
