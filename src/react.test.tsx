import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { EditorStorageAdapter } from "./browser.js";
import {
  useControllableEditorState,
  useEditorHotkeys,
  useEditorRuntime,
  usePersistentEditorRuntime,
  type UsePersistentEditorRuntimeResult,
} from "./react.js";

type Document = {
  title: string;
};

type PersistentRuntimeResult = UsePersistentEditorRuntimeResult<Document, string>;

const initialDocument: Document = { title: "Initial" };

describe("persistent editor runtime hook", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("loads on mount when loadOnMount is true", async () => {
    const onPersistenceEvent = vi.fn();
    const storage = createMemoryStorage<Document>({ title: "Stored" });
    const fixture = renderPersistentRuntime({ onPersistenceEvent, storage });

    await flushEffects();

    expect(fixture.result.state.document).toEqual({ title: "Stored" });
    expect(fixture.result.state.status).toBe("clean");
    expect(fixture.result.persistence.status).toBe("loaded");
    expect(onPersistenceEvent).toHaveBeenCalledWith({ revision: 0, type: "load-start" });
    expect(onPersistenceEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "load-success" }),
    );
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
    const onPersistenceEvent = vi.fn();
    const storage = createMemoryStorage<Document>(null);
    const fixture = renderPersistentRuntime({
      autosave: { delayMs: 25 },
      loadOnMount: false,
      onPersistenceEvent,
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
    expect(onPersistenceEvent).toHaveBeenCalledWith({
      revision: fixture.result.state.revision,
      type: "save-start",
    });
    expect(onPersistenceEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "save-success" }),
    );
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

  test("retries failed autosaves for the same revision", async () => {
    vi.useFakeTimers();
    const storage = createMemoryStorage<Document>(null);
    storage.save.mockRejectedValueOnce(new Error("save failed")).mockImplementationOnce((value) => {
      storage.value = value;
    });
    const fixture = renderPersistentRuntime({
      autosave: { delayMs: 0, retry: { attempts: 1, delayMs: 10 } },
      loadOnMount: false,
      storage,
    });

    act(() => {
      fixture.result.commit({ title: "Retry" });
    });
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });

    expect(fixture.result.persistence.status).toBe("error");
    expect(storage.save).toHaveBeenCalledOnce();

    await act(async () => {
      vi.advanceTimersByTime(10);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(storage.save).toHaveBeenCalledTimes(2);
    expect(fixture.result.persistence.status).toBe("saved");
    expect(fixture.result.state.status).toBe("clean");
    fixture.unmount();
  });

  test("stops autosave retries after the configured attempts", async () => {
    vi.useFakeTimers();
    const storage = createMemoryStorage<Document>(null);
    storage.save.mockRejectedValue(new Error("save failed"));
    const fixture = renderPersistentRuntime({
      autosave: { delayMs: 0, retry: { attempts: 1, delayMs: 10 } },
      loadOnMount: false,
      storage,
    });

    act(() => {
      fixture.result.commit({ title: "Retry once" });
    });
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(10);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });

    expect(storage.save).toHaveBeenCalledTimes(2);
    expect(fixture.result.persistence.status).toBe("error");
    fixture.unmount();
  });

  test("does not schedule a latest-revision follow-up when saveLatest is false", async () => {
    vi.useFakeTimers();
    const firstSave = createDeferred<void>();
    const storage = createMemoryStorage<Document>(null);
    storage.save.mockImplementationOnce(async (value) => {
      storage.value = value;
      await firstSave.promise;
    });
    const fixture = renderPersistentRuntime({
      autosave: { delayMs: 0, saveLatest: false },
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
    act(() => {
      fixture.result.commit({ title: "Second" });
    });
    await act(async () => {
      firstSave.resolve();
      await firstSave.promise;
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });

    expect(storage.save).toHaveBeenCalledOnce();
    expect(fixture.result.state.status).toBe("dirty");
    fixture.unmount();
  });

  test("does not update runtime state after unmounting during a save", async () => {
    vi.useFakeTimers();
    const save = createDeferred<void>();
    const storage = createMemoryStorage<Document>(null);
    storage.save.mockImplementationOnce(async (value) => {
      storage.value = value;
      await save.promise;
    });
    const fixture = renderPersistentRuntime({
      autosave: { delayMs: 0 },
      loadOnMount: false,
      storage,
    });

    act(() => {
      fixture.result.commit({ title: "Unmount" });
    });
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });

    expect(fixture.result.persistence.status).toBe("saving");
    fixture.unmount();
    await act(async () => {
      save.resolve();
      await save.promise;
      await Promise.resolve();
    });

    expect(storage.save).toHaveBeenCalledOnce();
  });
});

describe("editor react hooks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("useEditorRuntime commits, resets, undoes, and redoes documents", () => {
    const fixture = renderHook(() =>
      useEditorRuntime<Document, string>({
        history: {
          equals(left, right) {
            return left.title === right.title;
          },
        },
        initialDocument,
      }),
    );

    act(() => {
      fixture.result.commit({ title: "Changed" }, { selection: "title" });
    });
    expect(fixture.result.state.document).toEqual({ title: "Changed" });
    expect(fixture.result.state.selection).toBe("title");
    expect(fixture.result.state.status).toBe("dirty");

    act(() => {
      fixture.result.undo();
    });
    expect(fixture.result.state.document).toEqual(initialDocument);

    act(() => {
      fixture.result.redo();
    });
    expect(fixture.result.state.document).toEqual({ title: "Changed" });

    act(() => {
      fixture.result.reset({ title: "Reset" }, { markSaved: true });
    });
    expect(fixture.result.state.document).toEqual({ title: "Reset" });
    expect(fixture.result.state.status).toBe("clean");
    fixture.unmount();
  });

  test("useEditorHotkeys runs matching commands and ignores editable targets", () => {
    const run = vi.fn();
    const fixture = renderHook(() =>
      useEditorHotkeys({
        commands: [{ hotkeys: ["Mod+K"], id: "palette", label: "Palette", run }],
      }),
    );

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      key: "k",
      metaKey: true,
    });
    const preventDefault = vi.spyOn(event, "preventDefault");
    document.dispatchEvent(event);

    expect(run).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();

    const input = document.createElement("input");
    document.body.append(input);
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        key: "k",
        metaKey: true,
      }),
    );

    expect(run).toHaveBeenCalledOnce();
    input.remove();
    fixture.unmount();
  });

  test("useControllableEditorState supports uncontrolled and controlled values", () => {
    const uncontrolled = renderHook(() =>
      useControllableEditorState({ defaultValue: "draft", onChange: vi.fn() }),
    );

    act(() => {
      uncontrolled.result[1]((previous) => `${previous}-updated`);
    });
    expect(uncontrolled.result[0]).toBe("draft-updated");
    uncontrolled.unmount();

    const onChange = vi.fn();
    const controlled = renderControlledEditorState("external", onChange);
    act(() => {
      controlled.result[1]("internal");
    });

    expect(onChange).toHaveBeenCalledWith("internal");
    expect(controlled.result[0]).toBe("external");

    act(() => {
      controlled.setValue("next-external");
    });
    expect(controlled.result[0]).toBe("next-external");
    controlled.unmount();
  });
});

function renderPersistentRuntime(options: {
  autosave?:
    | boolean
    | { delayMs?: number; retry?: { attempts?: number; delayMs?: number }; saveLatest?: boolean };
  loadOnMount?: boolean;
  onPersistenceError?: (
    error: unknown,
    context: { operation: "load" | "save"; revision?: number },
  ) => void;
  onPersistenceEvent?: (event: unknown) => void;
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
      onPersistenceEvent: options.onPersistenceEvent,
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

function renderHook<TResult>(useHook: () => TResult): {
  get result(): TResult;
  unmount: () => void;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let result: TResult | null = null;

  function Fixture() {
    result = useHook();
    return null;
  }

  act(() => {
    root.render(<Fixture />);
  });

  return {
    get result() {
      if (result === null) {
        throw new Error("Hook fixture did not render.");
      }
      return result;
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function renderControlledEditorState(
  initialValue: string,
  onChange: (value: string) => void,
): {
  get result(): ReturnType<typeof useControllableEditorState<string>>;
  setValue: (value: string) => void;
  unmount: () => void;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let result: ReturnType<typeof useControllableEditorState<string>> | null = null;
  let setValue: ((value: string) => void) | null = null;

  function Fixture() {
    const [value, updateValue] = React.useState(initialValue);
    setValue = updateValue;
    result = useControllableEditorState({
      defaultValue: "unused",
      onChange,
      value,
    });
    return null;
  }

  act(() => {
    root.render(<Fixture />);
  });

  return {
    get result() {
      if (result === null) {
        throw new Error("Controlled state fixture did not render.");
      }
      return result;
    },
    setValue(value) {
      if (!setValue) {
        throw new Error("Controlled state fixture did not expose a setter.");
      }
      setValue(value);
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
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
