import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { EditorStorageAdapter } from "./browser.js";
import { usePersistentEditorRuntime, type UsePersistentEditorRuntimeResult } from "./react.js";

type Document = {
  title: string;
};

type PersistentRuntimeResult = UsePersistentEditorRuntimeResult<Document, string>;

const initialDocument: Document = { title: "Initial" };

describe("persistent editor runtime hook", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("loads on mount when loadOnMount is true", async () => {
    const storage = createMemoryStorage<Document>({ title: "Stored" });
    const fixture = renderPersistentRuntime({ storage });

    await flushEffects();

    expect(fixture.result.state.document).toEqual({ title: "Stored" });
    expect(fixture.result.state.status).toBe("clean");
    expect(fixture.result.persistence.status).toBe("loaded");
    fixture.unmount();
  });

  test("does not load on mount when loadOnMount is false", async () => {
    const storage = createMemoryStorage<Document>({ title: "Stored" });
    const fixture = renderPersistentRuntime({ loadOnMount: false, storage });

    await flushEffects();

    expect(fixture.result.state.document).toEqual(initialDocument);
    expect(fixture.result.persistence.status).toBe("idle");
    fixture.unmount();
  });

  test("debounces autosave after dirty commits", async () => {
    vi.useFakeTimers();
    const storage = createMemoryStorage<Document>(null);
    const fixture = renderPersistentRuntime({
      autosave: { delayMs: 25 },
      loadOnMount: false,
      storage,
    });

    act(() => {
      fixture.result.commit({ title: "Dirty" });
    });

    expect(storage.save).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(24);
      await Promise.resolve();
    });
    expect(storage.save).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(storage.save).toHaveBeenCalledWith({ title: "Dirty" });
    expect(fixture.result.state.status).toBe("clean");
    expect(fixture.result.persistence.status).toBe("saved");
    fixture.unmount();
  });

  test("does not mark current runtime clean when a stale save finishes after a newer edit", async () => {
    vi.useFakeTimers();
    const firstSave = createDeferred<void>();
    const storage = createMemoryStorage<Document>(null);
    storage.save.mockImplementationOnce(async (value) => {
      storage.value = value;
      await firstSave.promise;
    });
    const fixture = renderPersistentRuntime({
      autosave: { delayMs: 0 },
      loadOnMount: false,
      storage,
    });

    act(() => {
      fixture.result.commit({ title: "First" });
    });
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });

    expect(fixture.result.persistence.status).toBe("saving");

    act(() => {
      fixture.result.commit({ title: "Second" });
    });
    await act(async () => {
      firstSave.resolve();
      await firstSave.promise;
      await Promise.resolve();
    });

    expect(fixture.result.state.document).toEqual({ title: "Second" });
    expect(fixture.result.state.status).toBe("dirty");
    expect(fixture.result.persistence.status).toBe("saved");

    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });

    expect(storage.save).toHaveBeenLastCalledWith({ title: "Second" });
    expect(fixture.result.state.status).toBe("clean");
    fixture.unmount();
  });

  test("manual force save writes immediately", async () => {
    const storage = createMemoryStorage<Document>(null);
    const fixture = renderPersistentRuntime({
      autosave: false,
      loadOnMount: false,
      storage,
    });

    await act(async () => {
      await fixture.result.save({ force: true });
    });

    expect(storage.save).toHaveBeenCalledWith(initialDocument);
    expect(fixture.result.persistence.status).toBe("saved");
    fixture.unmount();
  });

  test("failed autosave exposes error state and keeps runtime dirty", async () => {
    vi.useFakeTimers();
    const onPersistenceError = vi.fn();
    const storage = createMemoryStorage<Document>(null);
    storage.save.mockRejectedValueOnce(new Error("save failed"));
    const fixture = renderPersistentRuntime({
      autosave: { delayMs: 0 },
      loadOnMount: false,
      onPersistenceError,
      storage,
    });

    act(() => {
      fixture.result.commit({ title: "Dirty" });
    });
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });

    expect(fixture.result.state.status).toBe("dirty");
    expect(fixture.result.persistence.status).toBe("error");
    expect(fixture.result.persistence.error).toBeInstanceOf(Error);
    expect(onPersistenceError).toHaveBeenCalledWith(expect.any(Error), {
      operation: "save",
      revision: fixture.result.state.revision,
    });

    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });

    expect(storage.save).toHaveBeenCalledOnce();
    fixture.unmount();
  });
});

function renderPersistentRuntime(options: {
  autosave?: boolean | { delayMs?: number };
  loadOnMount?: boolean;
  onPersistenceError?: (
    error: unknown,
    context: { operation: "load" | "save"; revision?: number },
  ) => void;
  storage: MemoryStorage<Document>;
}): {
  get result(): PersistentRuntimeResult;
  unmount: () => void;
} {
  const container = document.createElement("div");
  const root = createRoot(container);
  let result: PersistentRuntimeResult | null = null;

  function Fixture() {
    result = usePersistentEditorRuntime<Document, string>({
      autosave: options.autosave,
      history: {
        equals(left, right) {
          return left.title === right.title;
        },
      },
      initialDocument,
      loadOnMount: options.loadOnMount,
      onPersistenceError: options.onPersistenceError,
      storage: options.storage,
    });
    return null;
  }

  act(() => {
    root.render(<Fixture />);
  });

  return {
    get result() {
      if (!result) {
        throw new Error("Persistent runtime fixture did not render.");
      }
      return result;
    },
    unmount() {
      act(() => {
        root.unmount();
      });
    },
  };
}

type MemoryStorage<TValue> = EditorStorageAdapter<TValue> & {
  value: TValue | null;
  load: ReturnType<typeof vi.fn<() => TValue | null>>;
  save: ReturnType<typeof vi.fn<(value: TValue) => void | Promise<void>>>;
};

function createMemoryStorage<TValue>(initialValue: TValue | null): MemoryStorage<TValue> {
  const storage = {
    value: initialValue,
  } as MemoryStorage<TValue>;

  storage.load = vi.fn(() => storage.value);
  storage.save = vi.fn((value: TValue) => {
    storage.value = value;
  });

  return storage;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

function createDeferred<TValue>() {
  let resolve!: (value: TValue | PromiseLike<TValue>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<TValue>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}
