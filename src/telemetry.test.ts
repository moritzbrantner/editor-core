import { describe, expect, test, vi } from "vitest";
import { createEditorCommandRuntime } from "./commands.js";
import { applyEditorOperation, createEditorOperationRuntime } from "./operations.js";
import { createTestScheduler, flushPromises } from "./persistence/test-support.js";
import { createEditorPluginRegistry, resolveEditorPluginRuntimeOptions } from "./plugins.js";
import { commitEditorRuntime, createEditorRuntime } from "./runtime.js";
import { createEditorSession, createMemoryEditorSessionStore } from "./session.js";
import {
  createEditorTelemetry,
  createEditorTelemetryRecorder,
  enrichEditorTelemetry,
  filterEditorTelemetry,
  sampleEditorTelemetry,
  type EditorTelemetryEvent,
} from "./telemetry.js";

type Doc = { title: string };

function recorded(processors?: Parameters<typeof createEditorTelemetry>[0]["processors"]) {
  const recorder = createEditorTelemetryRecorder();
  let id = 0;
  let clock = 0;
  const telemetry = createEditorTelemetry({
    clock: () => 1_000,
    createCorrelationId: () => `c${(id += 1)}`,
    now: () => (clock += 5),
    processors,
    sink: recorder.sink,
  });
  return { events: recorder.events, telemetry };
}

const secret = "SECRET DOCUMENT TEXT";

function expectNoContent(events: readonly EditorTelemetryEvent[]) {
  expect(JSON.stringify(events)).not.toContain(secret);
}

describe("editor telemetry", () => {
  test("emits versioned envelopes and lets processors redact, enrich, sample and drop", () => {
    const { events, telemetry } = recorded([
      filterEditorTelemetry(["document.measurement", "viewport.measurement"]),
      (event) => (event.name === "viewport.measurement" ? null : event),
      enrichEditorTelemetry({ app: "test" }),
      sampleEditorTelemetry(0.5, () => 0.1),
    ]);

    telemetry.emit("document.measurement", { metric: "nodes", value: 3 }, { durationMs: 2 });
    telemetry.emit("viewport.measurement", { metric: "fps", value: 60 });
    telemetry.emit("validation.summary", {
      errorCount: 0,
      issueCount: 0,
      revision: 0,
      warningCount: 0,
    });

    expect(events).toEqual([
      {
        attributes: { metric: "nodes", value: 3 },
        context: { app: "test" },
        correlationId: "c1",
        durationMs: 2,
        name: "document.measurement",
        schemaVersion: 1,
        timestamp: 1_000,
      },
    ]);
    const dropped = recorded([sampleEditorTelemetry(0.5, () => 0.9)]);
    dropped.telemetry.emit("document.measurement", { metric: "nodes", value: 1 });
    expect(dropped.events).toEqual([]);
  });

  test("swallows sink and processor failures", () => {
    const onError = vi.fn();
    const telemetry = createEditorTelemetry({
      onError,
      sink: () => {
        throw new Error("sink down");
      },
    });
    const runtime = createEditorOperationRuntime<Doc>({
      initialDocument: { title: "a" },
      telemetry,
      validate: () => [],
    });

    const next = applyEditorOperation(runtime, {
      apply: () => ({ title: "b" }),
      id: "rename",
    });

    expect(next.runtime.document).toEqual({ title: "b" });
    expect(onError).toHaveBeenCalled();
  });

  test("reports validation and operation outcomes without document content", () => {
    const { events, telemetry } = recorded();
    let runtime = createEditorOperationRuntime<Doc>({
      initialDocument: { title: secret },
      preflight: ({ operation }) =>
        operation.id === "blocked" ? [{ message: secret, path: "title" }] : [],
      telemetry,
      validate: (document) => (document.title === "" ? [{ message: secret, path: "title" }] : []),
    });
    runtime = applyEditorOperation(runtime, { apply: () => ({ title: "" }), id: "clear" });
    runtime = applyEditorOperation(runtime, { apply: (doc) => doc, id: "blocked" });

    expect(events.map((event) => [event.name, event.attributes])).toEqual([
      ["validation.summary", { errorCount: 0, issueCount: 0, revision: 0, warningCount: 0 }],
      ["validation.summary", { errorCount: 1, issueCount: 1, revision: 1, warningCount: 0 }],
      [
        "operation.apply",
        {
          errorCount: 0,
          issueCount: 0,
          merged: false,
          operationId: "clear",
          revision: 1,
          status: "applied",
          warningCount: 0,
        },
      ],
      [
        "operation.apply",
        {
          errorCount: 1,
          issueCount: 1,
          merged: false,
          operationId: "blocked",
          revision: 1,
          status: "rejected",
          warningCount: 0,
        },
      ],
    ]);
    expect(events[2]?.durationMs).toBeGreaterThan(0);
    expectNoContent(events);
  });

  test("reports command outcomes and rethrows command failures", async () => {
    const { events, telemetry } = recorded();
    const commands = createEditorCommandRuntime({
      commands: [
        { hotkeys: ["Mod+S"], id: "save", label: "Save", run: () => {} },
        {
          hotkeys: ["Mod+B"],
          id: "boom",
          label: "Boom",
          run: () => {
            throw new TypeError(secret);
          },
        },
      ],
      telemetry,
    });
    const key = (key: string) => ({
      altKey: false,
      ctrlKey: false,
      key,
      metaKey: true,
      shiftKey: false,
      target: null,
    });

    await commands.run(key("s"));
    await commands.run(key("x"));
    await expect(commands.run(key("b"))).rejects.toThrow(TypeError);

    expect(events.map((event) => event.attributes)).toEqual([
      { commandId: "save", status: "ran" },
      { commandId: "boom", errorName: "TypeError", status: "failed" },
    ]);
    expectNoContent(events);
  });

  test("reports plugin failures and keeps the original error", () => {
    const { events, telemetry } = recorded();
    const registry = createEditorPluginRegistry<Doc, unknown>([
      {
        id: "lint",
        validators: [
          () => {
            throw new RangeError(secret);
          },
        ],
      },
    ]);
    const options = resolveEditorPluginRuntimeOptions(registry, {
      initialDocument: { title: "a" },
      telemetry,
    });

    expect(() => createEditorRuntime(options)).toThrow(RangeError);
    expect(events.map((event) => event.attributes)).toEqual([
      { errorName: "RangeError", hook: "validator", pluginId: "lint" },
    ]);
  });

  test("reports session load, migration, recovery and autosave latency", async () => {
    const { events, telemetry } = recorded();
    const store = createMemoryEditorSessionStore();
    await store.write("document", JSON.stringify({ title: secret }), null);
    await store.write("journal", JSON.stringify({ title: secret }));
    const scheduler = createTestScheduler();
    const session = createEditorSession<Doc>({
      autosave: { delayMs: 10 },
      codec: { migrate: (payload) => payload, parse: (payload) => payload as Doc },
      runtime: createEditorRuntime<Doc>({ initialDocument: { title: "fallback" } }),
      scheduler,
      store,
      telemetry,
    });

    await session.load();
    session.restoreRecovery();
    session.update((runtime) => commitEditorRuntime(runtime, { title: "edited" }));
    await scheduler.runNext();
    await flushPromises();

    expect(events.map((event) => [event.name, event.attributes])).toEqual([
      ["session.migration", { slot: "document", status: "migrated" }],
      ["session.migration", { slot: "journal", status: "migrated" }],
      ["session.recovery", { kind: "unsaved", status: "found" }],
      ["persistence.load", { revision: 1, status: "loaded" }],
      ["session.recovery", { kind: "unsaved", status: "restored" }],
      ["persistence.save", { revision: 3, status: "saved", trigger: "autosave" }],
    ]);
    expect(events.at(-1)?.durationMs).toBeGreaterThan(0);
    expectNoContent(events);
  });
});
