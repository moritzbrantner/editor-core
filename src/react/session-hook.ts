import * as React from "react";
import type { EditorSession, EditorSessionState } from "../persistence.js";

export function useEditorSession<TDocument, TPayload>(
  session: EditorSession<TDocument, TPayload>,
): EditorSessionState<TDocument, TPayload> {
  return React.useSyncExternalStore(session.subscribe, session.getState, session.getState);
}
