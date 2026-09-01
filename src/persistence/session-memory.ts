import type { EditorSessionStorageAdapter, EditorSessionStorageSnapshot } from "../session.js";
import { EditorSessionConflictError } from "../session.js";
import type { EditorRevisionToken } from "../collaboration.js";
import type { EditorSessionJournalAdapter } from "./session-types.js";

export function createMemoryEditorSessionStorage<TPayload>(
  initial: EditorSessionStorageSnapshot<TPayload> | null = null,
): EditorSessionStorageAdapter<TPayload> {
  let value = initial;
  let revision = numericRevision(initial?.revisionToken) ?? 0;

  return {
    clear() {
      value = null;
    },
    load() {
      return value;
    },
    save(next) {
      const currentRevisionToken = value?.revisionToken ?? null;
      if (next.revisionToken !== currentRevisionToken) {
        throw new EditorSessionConflictError({
          actualRevisionToken: currentRevisionToken,
          expectedRevisionToken: next.revisionToken,
          remotePayload: value?.payload,
        });
      }

      revision += 1;
      value = {
        payload: next.payload,
        revisionToken: String(revision),
      };
      return value;
    },
  };
}

export function createMemoryEditorSessionJournal<TDocument>(
  initial: TDocument | null = null,
): EditorSessionJournalAdapter<TDocument> {
  let document = initial;
  return {
    clear() {
      document = null;
    },
    load() {
      return document;
    },
    save(nextDocument) {
      document = nextDocument;
    },
  };
}

function numericRevision(revisionToken: EditorRevisionToken | undefined): number | null {
  if (revisionToken === undefined) {
    return null;
  }
  const revision = Number(revisionToken);
  return Number.isFinite(revision) ? revision : null;
}
