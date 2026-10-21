// Browser reference stores. They touch `localStorage` / `indexedDB` only when called, so importing
// the session entrypoint stays safe outside the browser.
import { EditorSessionError, toEditorSessionError } from "./errors.js";
import {
  nextEditorSessionRevision,
  type EditorSessionRecord,
  type EditorSessionSlot,
  type EditorSessionStore,
} from "./store.js";

export type LocalStorageEditorSessionStoreOptions = {
  /** Key prefix; each slot is stored under `${key}:${slot}`. */
  key: string;
  storage?: Storage;
};

export function createLocalStorageEditorSessionStore(
  options: LocalStorageEditorSessionStoreOptions,
): EditorSessionStore {
  const storage = (): Storage => {
    try {
      const resolved = options.storage ?? globalThis.localStorage;
      if (!resolved) {
        throw new EditorSessionError("permission", "localStorage is not available.");
      }
      return resolved;
    } catch (error) {
      throw toEditorSessionError(error, "permission");
    }
  };
  const itemKey = (slot: EditorSessionSlot) => `${options.key}:${slot}`;
  const readRecord = (slot: EditorSessionSlot): EditorSessionRecord | null => {
    const raw = storage().getItem(itemKey(slot));
    return raw === null ? null : (JSON.parse(raw) as EditorSessionRecord);
  };

  return {
    async read(slot) {
      try {
        return readRecord(slot);
      } catch (error) {
        throw toEditorSessionError(error);
      }
    },
    async write(slot, value, expectedRevision) {
      try {
        // Read, compare and write run in one synchronous task, so tabs cannot interleave.
        const revision = nextEditorSessionRevision(slot, readRecord(slot), expectedRevision);
        storage().setItem(itemKey(slot), JSON.stringify({ revision, value }));
        return revision;
      } catch (error) {
        throw toEditorSessionError(error);
      }
    },
    async remove(slot) {
      try {
        storage().removeItem(itemKey(slot));
      } catch (error) {
        throw toEditorSessionError(error);
      }
    },
  };
}

export type IndexedDbEditorSessionStoreOptions = {
  databaseName: string;
  /** Object store name, default `editor-session`. */
  storeName?: string;
  indexedDB?: IDBFactory;
};

export function createIndexedDbEditorSessionStore(
  options: IndexedDbEditorSessionStoreOptions,
): EditorSessionStore {
  const storeName = options.storeName ?? "editor-session";
  let database: Promise<IDBDatabase> | null = null;

  const open = (): Promise<IDBDatabase> => {
    database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const factory = options.indexedDB ?? globalThis.indexedDB;
      if (!factory) {
        reject(new EditorSessionError("permission", "IndexedDB is not available."));
        return;
      }
      const request = factory.open(options.databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(storeName);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error: unknown) => {
      database = null;
      throw error;
    });
    return database;
  };

  // Every operation runs in one transaction, so a compare-and-swap is atomic across tabs.
  const run = async <TResult>(
    mode: IDBTransactionMode,
    operation: (
      store: IDBObjectStore,
      done: (result: TResult) => void,
      fail: (error: unknown) => void,
    ) => void,
  ): Promise<TResult> => {
    try {
      const db = await open();
      return await new Promise<TResult>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        let result: TResult;
        let failure: unknown = null;
        const fail = (error: unknown) => {
          failure = error;
          transaction.abort();
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(failure ?? transaction.error);
        try {
          operation(
            transaction.objectStore(storeName),
            (value) => {
              result = value;
            },
            fail,
          );
        } catch (error) {
          fail(error);
        }
      });
    } catch (error) {
      throw toEditorSessionError(error);
    }
  };

  return {
    read(slot) {
      return run<EditorSessionRecord | null>("readonly", (store, done) => {
        const request = store.get(slot);
        request.onsuccess = () => done((request.result as EditorSessionRecord | undefined) ?? null);
      });
    },
    write(slot, value, expectedRevision) {
      return run<number>("readwrite", (store, done, fail) => {
        const request = store.get(slot);
        request.onsuccess = () => {
          try {
            const current = (request.result as EditorSessionRecord | undefined) ?? null;
            const revision = nextEditorSessionRevision(slot, current, expectedRevision);
            store.put({ revision, value } satisfies EditorSessionRecord, slot);
            done(revision);
          } catch (error) {
            fail(error);
          }
        };
      });
    },
    remove(slot) {
      return run<void>("readwrite", (store, done) => {
        store.delete(slot);
        done(undefined);
      });
    },
  };
}
