import { useSyncExternalStore } from "react";
import type { EditorSession, EditorSessionState } from "../session.js";

/** Subscribes a component to an editor session created with `createEditorSession`. */
export function useEditorSession<TDocument, TSelection = unknown>(
  session: EditorSession<TDocument, TSelection>,
): EditorSessionState<TDocument, TSelection> {
  return useSyncExternalStore(session.subscribe, session.getState, session.getState);
}
