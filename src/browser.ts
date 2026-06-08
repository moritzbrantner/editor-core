export type DownloadEditorJsonOptions = {
  filename?: string;
  pretty?: boolean | number;
};

export type ReadEditorJsonFileOptions<TValue> = {
  parse?: (input: unknown) => TValue;
};

export type EditorBrowserErrorContext =
  | { operation: "clipboard-read" }
  | { key?: string; operation: "storage-load" }
  | { key?: string; operation: "storage-save" };

export type EditorBrowserErrorHandler = (
  error: unknown,
  context: EditorBrowserErrorContext,
) => void;

export type EditorStorageAdapter<TValue> = {
  load: () => TValue | null | Promise<TValue | null>;
  save: (value: TValue) => void | Promise<void>;
};

export type LocalStorageEditorStorageOptions<TValue> = {
  key: string;
  storage?: Storage;
  parse?: (input: unknown) => TValue;
  serialize?: (value: TValue) => unknown;
  onError?: EditorBrowserErrorHandler;
};

export type EditorClipboardFallback = {
  text?: string | null;
};

export type EditorClipboardJsonOptions = {
  fallback?: EditorClipboardFallback;
  onError?: EditorBrowserErrorHandler;
};

export type LoadEditorStorageOptions<TValue> = {
  normalize?: (value: TValue) => TValue;
  onError?: EditorBrowserErrorHandler;
};

export type SaveEditorStorageOptions<TValue> = {
  normalize?: (value: TValue) => TValue;
  onError?: EditorBrowserErrorHandler;
};

export function ensureEditorJsonFilename(filename: string): string {
  return filename.toLowerCase().endsWith(".json") ? filename : `${filename}.json`;
}

export function downloadEditorJson(value: unknown, options: DownloadEditorJsonOptions = {}): void {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return;
  }

  const filename = ensureEditorJsonFilename(options.filename ?? "editor-document.json");
  const spacing =
    options.pretty === false ? undefined : typeof options.pretty === "number" ? options.pretty : 2;
  const blob = new Blob([`${JSON.stringify(value, null, spacing)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function readEditorJsonFile<TValue = unknown>(
  file: Blob,
  options: ReadEditorJsonFileOptions<TValue> = {},
): Promise<TValue> {
  const input = JSON.parse(await file.text()) as unknown;
  return options.parse ? options.parse(input) : (input as TValue);
}

export function createLocalStorageEditorStorage<TValue>(
  options: LocalStorageEditorStorageOptions<TValue>,
): EditorStorageAdapter<TValue> {
  return {
    load() {
      const storage = resolveStorage(options.storage);
      if (!storage) {
        return null;
      }

      try {
        const raw = storage.getItem(options.key);
        if (!raw) {
          return null;
        }

        const parsed = JSON.parse(raw) as unknown;
        return options.parse ? options.parse(parsed) : (parsed as TValue);
      } catch (error) {
        options.onError?.(error, { key: options.key, operation: "storage-load" });
        throw error;
      }
    },
    save(value) {
      const storage = resolveStorage(options.storage);
      if (!storage) {
        return;
      }

      try {
        storage.setItem(
          options.key,
          JSON.stringify(options.serialize ? options.serialize(value) : value),
        );
      } catch (error) {
        options.onError?.(error, { key: options.key, operation: "storage-save" });
        throw error;
      }
    },
  };
}

export async function loadEditorStorage<TValue>(
  storage: EditorStorageAdapter<TValue>,
  fallback: TValue,
  options: LoadEditorStorageOptions<TValue> = {},
): Promise<TValue> {
  try {
    const value = await storage.load();
    if (value === null) {
      return fallback;
    }
    return options.normalize ? options.normalize(value) : value;
  } catch (error) {
    options.onError?.(error, { operation: "storage-load" });
    return fallback;
  }
}

export async function saveEditorStorage<TValue>(
  storage: EditorStorageAdapter<TValue>,
  value: TValue,
  options: SaveEditorStorageOptions<TValue> = {},
): Promise<void> {
  try {
    await storage.save(options.normalize ? options.normalize(value) : value);
  } catch (error) {
    options.onError?.(error, { operation: "storage-save" });
    throw error;
  }
}

export async function writeEditorClipboardJson(
  payload: unknown,
  options: EditorClipboardJsonOptions = {},
): Promise<boolean> {
  const text = JSON.stringify(payload);

  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard is unavailable");
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (options.fallback) {
      options.fallback.text = text;
    }
    return false;
  }
}

export async function readEditorClipboardJson<TValue = unknown>(
  options: EditorClipboardJsonOptions = {},
): Promise<TValue | null> {
  let text: string | null | undefined;

  try {
    text = await navigator.clipboard?.readText();
  } catch (error) {
    options.onError?.(error, { operation: "clipboard-read" });
    text = options.fallback?.text;
  }

  text ??= options.fallback?.text;
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as TValue;
  } catch (error) {
    options.onError?.(error, { operation: "clipboard-read" });
    if (options.fallback?.text && options.fallback.text !== text) {
      try {
        return JSON.parse(options.fallback.text) as TValue;
      } catch (fallbackError) {
        options.onError?.(fallbackError, { operation: "clipboard-read" });
      }
    }
    return null;
  }
}

function resolveStorage(storage: Storage | undefined): Storage | null {
  if (storage) {
    return storage;
  }

  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}
