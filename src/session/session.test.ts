import { describe, expect, test } from "vitest";
import { createTestScheduler, flushPromises } from "../persistence/test-support.js";
import { commitEditorRuntime, createEditorRuntime } from "../runtime.js";
import {
  createEditorSession,
  createMemoryEditorSessionStore,
  type EditorSessionCodec,
  type EditorSessionOptions,
  type EditorSessionStore,
} from "../session.js";

type Doc = { title: string };

const codec: EditorSessionCodec<Doc> = {
  migrate: (payload) => {
    const value = payload as { title?: unknown; name?: unknown };
    if (value.name === "unmigratable") throw new Error("unknown version");
    return value.title === undefined ? { title: value.name } : value;
  },
  parse: (payload) => {
    const value = payload as { title?: unknown };
    if (typeof value.title !== "string") throw new Error("title must be a string");
    return { title: value.title };
  },
};

function setup(
  store: EditorSessionStore = createMemoryEditorSessionStore(),
  options: Partial<EditorSessionOptions<Doc>> = {},
) {
  const scheduler = createTestScheduler();
  const session = createEditorSession<Doc>({
    autosave: { delayMs: 10 },
    codec,
    runtime: createEditorRuntime<Doc>({ initialDocument: { title: "Fallback" } }),
    scheduler,
    store,
    ...options,
  });
  const edit = (title: string) =>
    session.update((runtime) => commitEditorRuntime(runtime, { title }));
  return { edit, scheduler, session, store };
}

describe("editor session", () => {
  test("loads, debounces autosave and moves through the lifecycle", async () => {
    const store = createMemoryEditorSessionStore();
    await store.write("document", JSON.stringify({ name: "Legacy" }), null);
    const { edit, scheduler, session } = setup(store);

    expect(session.getState().lifecycle).toBe("idle");
    await session.load();
    expect(session.getState().runtime.document).toEqual({ title: "Legacy" });

    edit("Edited");
    expect(session.getState().lifecycle).toBe("dirty");
    expect(scheduler.pendingDelays()).toEqual([10]);

    await scheduler.runNext();
    await flushPromises();
    expect(session.getState().lifecycle).toBe("saved");
    expect(await store.read("document")).toEqual({ revision: 2, value: '{"title":"Edited"}' });
    expect(await store.read("snapshot")).toMatchObject({ value: '{"title":"Edited"}' });
  });

  test("cancels and flushes autosave", async () => {
    const { edit, scheduler, session, store } = setup();
    await session.load();
    edit("One");
    session.cancelAutosave();
    expect(scheduler.pendingDelays()).toEqual([]);
    expect(session.getState().lifecycle).toBe("dirty");

    expect(await session.flush()).toBe(true);
    expect(await store.read("document")).toMatchObject({ value: '{"title":"One"}' });
  });

  test("rejects stale writes from a second session as a conflict", async () => {
    const store = createMemoryEditorSessionStore();
    await store.write("document", '{"title":"Base"}', null);
    const first = setup(store);
    const second = setup(store);
    await first.session.load();
    await second.session.load();

    first.edit("First");
    await first.session.flush();
    second.edit("Second");
    expect(await second.session.flush()).toBe(false);

    const state = second.session.getState();
    expect(state.lifecycle).toBe("conflicted");
    expect(state.error?.kind).toBe("conflict");
    expect(state.persistence.conflict?.remote?.document).toEqual({ title: "First" });
    expect(state.runtime.status).toBe("dirty");
    expect(await store.read("document")).toMatchObject({ value: '{"title":"First"}' });
  });

  test("failed saves keep the dirty document and the last-known-good snapshot", async () => {
    const memory = createMemoryEditorSessionStore();
    let failWrites = false;
    const store: EditorSessionStore = {
      ...memory,
      write: (slot, value, expected) =>
        failWrites
          ? Promise.reject(Object.assign(new Error("full"), { name: "QuotaExceededError" }))
          : memory.write(slot, value, expected),
    };
    const { edit, session } = setup(store);
    await session.load();
    edit("Saved");
    await session.flush();

    failWrites = true;
    edit("Unsaved");
    expect(await session.flush()).toBe(false);
    const state = session.getState();
    expect(state.lifecycle).toBe("failed");
    expect(state.error?.kind).toBe("quota");
    expect(state.runtime.document).toEqual({ title: "Unsaved" });
    expect(await memory.read("snapshot")).toMatchObject({ value: '{"title":"Saved"}' });
  });

  test("reports serialization failures as typed diagnostics", async () => {
    const { edit, session } = setup(undefined, {
      codec: { ...codec, serialize: () => ({ big: 1n }) },
    });
    await session.load();
    edit("Anything");
    await session.flush();
    expect(session.getState().error?.kind).toBe("serialization");
  });

  test.each([
    ["validation", '{"title":42}'],
    ["migration", '{"name":"unmigratable"}'],
    ["serialization", "{"],
  ])("quarantines a %s failure and recovers the last-known-good snapshot", async (kind, value) => {
    const store = createMemoryEditorSessionStore();
    await store.write("document", '{"title":"Good"}', null);
    await store.write("snapshot", '{"title":"Good"}');
    await store.write("document", value, 1);
    const { edit, session } = setup(store);
    await session.load();

    const state = session.getState();
    expect(state.lifecycle).toBe("recoverable");
    expect(state.recovery).toMatchObject({ kind: "corrupt", payload: value });
    expect(state.recovery?.kind === "corrupt" && state.recovery.error.kind).toBe(kind);
    expect(state.runtime.document).toEqual({ title: "Good" });
    expect(await store.read("quarantine")).toMatchObject({ value });

    await session.discardRecovery();
    expect(await store.read("quarantine")).toBeNull();
    edit("Repaired");
    expect(await session.flush()).toBe(true);
  });

  test("journals unsaved work and restores it after an interruption", async () => {
    const store = createMemoryEditorSessionStore();
    const interrupted = setup(store, { autosave: false, journal: true });
    await interrupted.session.load();
    interrupted.edit("Draft");
    await flushPromises();
    interrupted.session.dispose();

    const { session } = setup(store, { journal: true });
    await session.load();
    expect(session.getState().lifecycle).toBe("recoverable");
    expect(session.getState().recovery).toEqual({ document: { title: "Draft" }, kind: "unsaved" });

    session.restoreRecovery();
    expect(session.getState().lifecycle).toBe("dirty");
    expect(session.getState().runtime.document).toEqual({ title: "Draft" });
    await session.flush();
    expect(await store.read("journal")).toBeNull();
    expect(session.getState().lifecycle).toBe("saved");
  });

  test("notifies subscribers until unsubscribed", async () => {
    const { edit, session } = setup();
    let calls = 0;
    const unsubscribe = session.subscribe(() => (calls += 1));
    edit("One");
    expect(calls).toBeGreaterThan(0);
    unsubscribe();
    const seen = calls;
    edit("Two");
    expect(calls).toBe(seen);
  });
});
