import { EditorSessionError } from "./errors.js";

/**
 * Slots an editor session keeps in its store: the saved `document`, the `snapshot` of the
 * last-known-good save, the `journal` of unsaved work, and the `quarantine` holding a corrupt or
 * unmigratable payload until it is exported or discarded.
 */
export type EditorSessionSlot = "document" | "snapshot" | "journal" | "quarantine";

export type EditorSessionRecord = {
  value: string;
  /** Store-assigned revision token; it increases on every write to the slot. */
  revision: number;
};

/**
 * Revisioned key-value store behind an editor session.
 *
 * `write` is compare-and-swap: with `expectedRevision` `null` the slot must be empty, with a number
 * the slot's current revision must match, otherwise it throws an `EditorSessionError` of kind
 * `conflict` and leaves the slot unchanged. Omitting `expectedRevision` writes unconditionally.
 */
export type EditorSessionStore = {
  read: (slot: EditorSessionSlot) => Promise<EditorSessionRecord | null>;
  write: (
    slot: EditorSessionSlot,
    value: string,
    expectedRevision?: number | null,
  ) => Promise<number>;
  remove: (slot: EditorSessionSlot) => Promise<void>;
};

/** Applies the compare-and-swap rule shared by all reference stores; returns the next revision. */
export function nextEditorSessionRevision(
  slot: EditorSessionSlot,
  current: EditorSessionRecord | null,
  expectedRevision: number | null | undefined,
): number {
  if (expectedRevision !== undefined && (current?.revision ?? null) !== expectedRevision) {
    throw new EditorSessionError(
      "conflict",
      `Stale write to "${slot}": expected revision ${String(expectedRevision)}, found ${String(current?.revision ?? null)}.`,
    );
  }
  return (current?.revision ?? 0) + 1;
}

export function createMemoryEditorSessionStore(): EditorSessionStore {
  const records = new Map<EditorSessionSlot, EditorSessionRecord>();
  return {
    async read(slot) {
      return records.get(slot) ?? null;
    },
    async write(slot, value, expectedRevision) {
      const revision = nextEditorSessionRevision(slot, records.get(slot) ?? null, expectedRevision);
      records.set(slot, { revision, value });
      return revision;
    },
    async remove(slot) {
      records.delete(slot);
    },
  };
}
