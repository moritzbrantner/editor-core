import {
  EditorSessionConflictError,
  EditorSessionError,
  type EditorSessionOperation,
  type EditorSessionStorageAdapter,
  type EditorSessionStorageSnapshot,
} from "../session.js";

export type LocalStorageEditorSessionStorageOptions = {
  key: string;
  storage?: Storage;
};

export type IndexedDbEditorSessionStorageOptions = {
  databaseName: string;
  key: string;
  storeName?: string;
  indexedDB?: IDBFactory;
};

type LocalStorageEditorSessionRecord<TPayload> = {
  format: "@moenarch/editor-session";
  payload: TPayload;
  revision: number;
};

type IndexedDbEditorSessionRecord<TPayload> = LocalStorageEditorSessionRecord<TPayload> & {
  key: string;
};

export function createLocalStorageEditorSessionStorage<TPayload>(
  options: LocalStorageEditorSessionStorageOptions,
): EditorSessionStorageAdapter<TPayload> {
  return {
    clear() {
      const storage = resolveLocalStorage(options.storage);
      try {
        storage.removeItem(options.key);
      } catch (error) {
        throw classifyBrowserSessionStorageError(error, "save");
      }
    },
    load() {
      const storage = resolveLocalStorage(options.storage);
      const record = readLocalStorageSessionRecord<TPayload>(storage, options.key, "load");
      return record ? toStorageSnapshot(record) : null;
    },
    save(value) {
      const storage = resolveLocalStorage(options.storage);
      const current = readLocalStorageSessionRecord<TPayload>(storage, options.key, "save");
      const currentRevisionToken = current ? String(current.revision) : null;
      if (value.revisionToken !== currentRevisionToken) {
        throw new EditorSessionConflictError({
          actualRevisionToken: currentRevisionToken,
          expectedRevisionToken: value.revisionToken,
          remotePayload: current?.payload,
        });
      }

      const record: LocalStorageEditorSessionRecord<TPayload> = {
        format: "@moenarch/editor-session",
        payload: value.payload,
        revision: (current?.revision ?? 0) + 1,
      };
      try {
        storage.setItem(options.key, JSON.stringify(record));
      } catch (error) {
        throw classifyBrowserSessionStorageError(error, "save");
      }
      return toStorageSnapshot(record);
    },
  };
}

export function createIndexedDbEditorSessionStorage<TPayload>(
  options: IndexedDbEditorSessionStorageOptions,
): EditorSessionStorageAdapter<TPayload> {
  const storeName = options.storeName ?? "editor-sessions";
  return {
    async clear() {
      const database = await openEditorSessionDatabase(options, storeName, "save");
      try {
        const transaction = database.transaction(storeName, "readwrite");
        const completed = waitForTransaction(transaction);
        await waitForRequest(transaction.objectStore(storeName).delete(options.key));
        await completed;
      } catch (error) {
        throw classifyBrowserSessionStorageError(error, "save");
      } finally {
        database.close();
      }
    },
    async load() {
      const database = await openEditorSessionDatabase(options, storeName, "load");
      try {
        const transaction = database.transaction(storeName, "readonly");
        const completed = waitForTransaction(transaction);
        const record = await waitForRequest<IndexedDbEditorSessionRecord<TPayload> | undefined>(
          transaction.objectStore(storeName).get(options.key),
        );
        await completed;
        return record ? toStorageSnapshot(record) : null;
      } catch (error) {
        throw classifyBrowserSessionStorageError(error, "load");
      } finally {
        database.close();
      }
    },
    async save(value) {
      const database = await openEditorSessionDatabase(options, storeName, "save");
      try {
        const transaction = database.transaction(storeName, "readwrite");
        const completed = waitForTransaction(transaction);
        const objectStore = transaction.objectStore(storeName);
        const current = await waitForRequest<IndexedDbEditorSessionRecord<TPayload> | undefined>(
          objectStore.get(options.key),
        );
        const currentRevisionToken = current ? String(current.revision) : null;
        if (value.revisionToken !== currentRevisionToken) {
          transaction.abort();
          await completed.catch(() => undefined);
          throw new EditorSessionConflictError({
            actualRevisionToken: currentRevisionToken,
            expectedRevisionToken: value.revisionToken,
            remotePayload: current?.payload,
          });
        }

        const record: IndexedDbEditorSessionRecord<TPayload> = {
          format: "@moenarch/editor-session",
          key: options.key,
          payload: value.payload,
          revision: (current?.revision ?? 0) + 1,
        };
        await waitForRequest(objectStore.put(record));
        await completed;
        return toStorageSnapshot(record);
      } catch (error) {
        throw classifyBrowserSessionStorageError(error, "save");
      } finally {
        database.close();
      }
    },
  };
}

function readLocalStorageSessionRecord<TPayload>(
  storage: Storage,
  key: string,
  operation: "load" | "save",
): LocalStorageEditorSessionRecord<TPayload> | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch (error) {
    throw classifyBrowserSessionStorageError(error, operation);
  }
  if (raw === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !isRecord(parsed) ||
      parsed.format !== "@moenarch/editor-session" ||
      typeof parsed.revision !== "number" ||
      !("payload" in parsed)
    ) {
      throw new Error("Expected editor session storage record.");
    }
    return parsed as LocalStorageEditorSessionRecord<TPayload>;
  } catch (error) {
    throw new EditorSessionError("Stored editor session payload is not valid JSON.", {
      cause: error,
      code: "serialization",
      operation,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStorageSnapshot<TPayload>(
  record: LocalStorageEditorSessionRecord<TPayload>,
): EditorSessionStorageSnapshot<TPayload> {
  return {
    payload: record.payload,
    revisionToken: String(record.revision),
  };
}

function resolveLocalStorage(storage: Storage | undefined): Storage {
  if (storage) {
    return storage;
  }
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch (error) {
    throw classifyBrowserSessionStorageError(error, "load");
  }
  throw new EditorSessionError("Local storage is unavailable.", {
    code: "permission",
    operation: "load",
  });
}

function openEditorSessionDatabase(
  options: IndexedDbEditorSessionStorageOptions,
  storeName: string,
  operation: "load" | "save",
): Promise<IDBDatabase> {
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) {
    throw new EditorSessionError("IndexedDB is unavailable.", {
      code: "permission",
      operation,
    });
  }

  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(options.databaseName, 1);
    } catch (error) {
      reject(classifyBrowserSessionStorageError(error, operation));
      return;
    }
    request.onblocked = () =>
      reject(
        new EditorSessionError("IndexedDB upgrade was blocked by another connection.", {
          code: "storage",
          operation,
        }),
      );
    request.onerror = () => reject(classifyBrowserSessionStorageError(request.error, operation));
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForRequest<TResult>(request: IDBRequest<TResult>): Promise<TResult> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.onabort = () => reject(transaction.error ?? new Error("Transaction aborted."));
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}

export function classifyBrowserSessionStorageError(
  error: unknown,
  operation: Extract<EditorSessionOperation, "load" | "save">,
): EditorSessionError {
  if (error instanceof EditorSessionError) {
    return error;
  }
  const name = error instanceof DOMException ? error.name : "";
  const code =
    name === "QuotaExceededError"
      ? "quota"
      : name === "SecurityError" || name === "NotAllowedError"
        ? "permission"
        : name === "DataCloneError"
          ? "serialization"
          : "storage";
  return new EditorSessionError(
    error instanceof Error ? error.message : "Browser session storage failed.",
    { cause: error, code, operation },
  );
}
