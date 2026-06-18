import { vi } from "vitest";
import type { EditorStorageAdapter } from "../browser.js";
import { createEditorRuntime, type EditorRuntimeState } from "../runtime.js";
import type { EditorConflictStorageAdapter, EditorPersistedDocument } from "./conflict.js";
import type { EditorPersistenceScheduler } from "./controller-types.js";

export type TestDocument = {
  body: string;
  title: string;
};

export const clock = () => "2026-06-06T12:00:00.000Z";

export function resolveUpdater<T>(value: T, updater: T | ((current: T) => T)): T {
  return typeof updater === "function" ? (updater as (current: T) => T)(value) : updater;
}

export async function flushPromises(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

export function createRuntime(): EditorRuntimeState<TestDocument, string> {
  return createEditorRuntime<TestDocument, string>({
    history: {
      equals(left, right) {
        return left.body === right.body && left.title === right.title;
      },
    },
    initialDocument: { body: "Hello", title: "Draft" },
  });
}

export function createMemoryStorage<TValue>(
  initialValue: TValue | null,
): EditorStorageAdapter<TValue> {
  let value = initialValue;

  return {
    load() {
      return value;
    },
    save(nextValue) {
      value = nextValue;
    },
  };
}

export function createThrowingStorage<TValue>(
  operation: "load" | "save",
): EditorStorageAdapter<TValue> {
  return {
    load() {
      if (operation === "load") {
        throw new Error("load failed");
      }
      return null;
    },
    save() {
      if (operation === "save") {
        throw new Error("save failed");
      }
    },
  };
}

export type TrackedMemoryStorage<TValue> = EditorStorageAdapter<TValue> & {
  value: TValue | null;
  load: ReturnType<typeof vi.fn<() => TValue | null>>;
  save: ReturnType<typeof vi.fn<(value: TValue) => void | Promise<void>>>;
};

export function createTrackedMemoryStorage<TValue>(
  initialValue: TValue | null,
): TrackedMemoryStorage<TValue> {
  const storage = {
    value: initialValue,
  } as TrackedMemoryStorage<TValue>;

  storage.load = vi.fn(() => storage.value);
  storage.save = vi.fn((value: TValue) => {
    storage.value = value;
  });

  return storage;
}

export type ConflictMemoryStorage<TValue> = EditorConflictStorageAdapter<TValue> & {
  value: EditorPersistedDocument<TValue> | null;
  load: ReturnType<typeof vi.fn<() => EditorPersistedDocument<TValue> | null>>;
  save: ReturnType<
    typeof vi.fn<(value: EditorPersistedDocument<TValue>) => EditorPersistedDocument<TValue>>
  >;
};

export function createConflictMemoryStorage<TValue>(
  initialValue: EditorPersistedDocument<TValue> | null,
): ConflictMemoryStorage<TValue> {
  const storage = {
    value: initialValue,
  } as ConflictMemoryStorage<TValue>;

  storage.load = vi.fn(() => storage.value);
  storage.save = vi.fn((value: EditorPersistedDocument<TValue>) => {
    storage.value = value;
    return value;
  });

  return storage;
}

export type Deferred<TValue> = {
  promise: Promise<TValue>;
  reject: (error: unknown) => void;
  resolve: (value: TValue | PromiseLike<TValue>) => void;
};

export function createDeferred<TValue>(): Deferred<TValue> {
  let resolve: Deferred<TValue>["resolve"] | undefined;
  let reject: Deferred<TValue>["reject"] | undefined;
  const promise = new Promise<TValue>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    reject(error) {
      reject?.(error);
    },
    resolve(value) {
      resolve?.(value);
    },
  };
}

export function createTestScheduler(): EditorPersistenceScheduler & {
  pendingDelays: () => number[];
  runAll: () => Promise<void>;
  runNext: () => Promise<void>;
} {
  type Task = {
    active: boolean;
    callback: () => void;
    delayMs: number;
    id: number;
  };
  const tasks: Task[] = [];
  let nextId = 1;

  const scheduler = {
    clearTimeout(timer: unknown) {
      const task = tasks.find((candidate) => candidate.id === timer);
      if (task) {
        task.active = false;
      }
    },
    pendingDelays() {
      return tasks.filter((task) => task.active).map((task) => task.delayMs);
    },
    async runAll() {
      while (tasks.some((task) => task.active)) {
        await scheduler.runNext();
      }
    },
    async runNext() {
      const task = tasks.find((candidate) => candidate.active);
      if (!task) {
        return;
      }
      task.active = false;
      task.callback();
      await flushPromises();
    },
    setTimeout(callback: () => void, delayMs: number) {
      const task = {
        active: true,
        callback,
        delayMs,
        id: nextId,
      };
      nextId += 1;
      tasks.push(task);
      return task.id;
    },
  };

  return scheduler;
}
