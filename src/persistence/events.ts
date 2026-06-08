import type { EditorRevisionToken } from "../collaboration.js";
import type {
  EditorPersistenceEvent,
  EditorPersistenceEventHandler,
  EditorPersistenceRevisionOptions,
} from "./types.js";

export type { EditorPersistenceEvent, EditorPersistenceEventHandler };

export function emitRevisionTokenUpdated(
  options: { onEvent?: EditorPersistenceEventHandler },
  revisionToken: EditorRevisionToken | null,
  revisionOptions: EditorPersistenceRevisionOptions,
): void {
  if (!revisionOptions.emitRevisionToken) {
    return;
  }

  options.onEvent?.({ revisionToken, type: "revision-token-updated" });
}
