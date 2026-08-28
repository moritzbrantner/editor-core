import {
  applyEditorInteractionOperation,
  type EditorOperation,
  type EditorOperationRuntimeState,
} from "./operations.js";

export type EditorInteractionSession<TDocument, TInteraction = unknown> = {
  committedDocument: TDocument;
  previewDocument: TDocument;
  state: TInteraction | null;
};

export function createEditorInteractionSession<TDocument>(
  document: TDocument,
): EditorInteractionSession<TDocument> {
  return {
    committedDocument: document,
    previewDocument: document,
    state: null,
  };
}

export function beginEditorInteraction<TDocument, TInteraction>(
  session: EditorInteractionSession<TDocument, unknown>,
  state: TInteraction,
): EditorInteractionSession<TDocument, TInteraction> {
  return {
    committedDocument: session.committedDocument,
    previewDocument: session.committedDocument,
    state,
  };
}

export function updateEditorInteractionPreview<TDocument, TInteraction>(
  session: EditorInteractionSession<TDocument, TInteraction>,
  previewDocument: TDocument,
): EditorInteractionSession<TDocument, TInteraction> {
  return {
    ...session,
    previewDocument,
  };
}

export function cancelEditorInteraction<TDocument>(
  session: EditorInteractionSession<TDocument, unknown>,
): EditorInteractionSession<TDocument> {
  return createEditorInteractionSession(session.committedDocument);
}

export function commitEditorInteraction<TDocument>(
  session: EditorInteractionSession<TDocument, unknown>,
): EditorInteractionSession<TDocument> {
  return createEditorInteractionSession(session.previewDocument);
}

export function commitEditorInteractionOperation<TDocument, TSelection = unknown>(
  runtime: EditorOperationRuntimeState<TDocument, TSelection>,
  operation: EditorOperation<TDocument, TSelection>,
): EditorOperationRuntimeState<TDocument, TSelection> {
  return applyEditorInteractionOperation(runtime, operation);
}

export function isEditorInteractionActive(state: unknown | null): boolean {
  return state !== null;
}
