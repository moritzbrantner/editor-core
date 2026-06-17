import { describe, expect, test, vi } from "vitest";
import { createEditorAspect } from "./aspects.js";
import {
  commitEditorRuntime,
  createEditorRuntime,
  createEditorRuntimeCommands,
  markEditorRuntimeSaved,
  redoEditorRuntime,
  resetEditorRuntime,
  setEditorRuntimeSelection,
  undoEditorRuntime,
  validateEditorRuntime,
  type EditorRuntimeState,
} from "./runtime.js";

type Document = {
  body: string;
  title: string;
};

const normalize = (document: Document): Document => ({
  body: document.body.trim(),
  title: document.title.trim(),
});

const equalsDocument = (left: Document, right: Document) =>
  left.body === right.body && left.title === right.title;

const historyOptions = {
  equals: equalsDocument,
  normalize,
};

const validate = (document: Document) =>
  document.title.length === 0 ? [{ path: "title", message: "Title is required." }] : [];

const wordCountAspect = createEditorAspect<Document, number>({
  id: "word-count",
  derive({ document }) {
    return document.body.split(/\s+/u).filter(Boolean).length;
  },
});

describe("editor runtime", () => {
  test("creates initial runtime with normalized document, validation, aspects, and clean flags", () => {
    const runtime = createEditorRuntime({
      aspects: [wordCountAspect],
      history: historyOptions,
      initialDocument: { body: " hello world ", title: " Draft " },
      initialSelection: "title",
      validate,
    });

    expect(runtime.document).toEqual({ body: "hello world", title: "Draft" });
    expect(runtime.history.present).toEqual(runtime.document);
    expect(runtime).toMatchObject({
      canRedo: false,
      canUndo: false,
      revision: 0,
      savedRevision: 0,
      selection: "title",
      status: "clean",
    });
    expect(runtime.issues).toEqual([]);
    expect(runtime.aspectSnapshot.revision).toBe(0);
    expect(runtime.aspectSnapshot.aspects["word-count"]?.value).toBe(2);
  });

  test("commits direct documents and updater functions", () => {
    let runtime = createTestRuntime();

    runtime = commitEditorRuntime(runtime, { body: "body", title: "First" });
    expect(runtime.document.title).toBe("First");
    expect(runtime.revision).toBe(1);
    expect(runtime.status).toBe("dirty");

    runtime = commitEditorRuntime(runtime, ({ document, revision }) => ({
      ...document,
      body: `revision ${revision}`,
    }));

    expect(runtime.document.body).toBe("revision 1");
    expect(runtime.revision).toBe(2);
    expect(runtime.history.past).toHaveLength(2);
  });

  test("skips equal commits while allowing selection changes", () => {
    let runtime = createTestRuntime();

    runtime = commitEditorRuntime(runtime, { body: "Hello", title: "Draft" });
    expect(runtime.revision).toBe(0);
    expect(runtime.status).toBe("clean");

    runtime = commitEditorRuntime(
      runtime,
      { body: "Hello", title: "Draft" },
      { selection: "body" },
    );
    expect(runtime.revision).toBe(0);
    expect(runtime.selection).toBe("body");
    expect(runtime.status).toBe("clean");
  });

  test("marks saved explicitly and during commits", () => {
    let runtime = createTestRuntime();

    runtime = commitEditorRuntime(runtime, { body: "Hello", title: "Changed" });
    expect(runtime.status).toBe("dirty");

    runtime = markEditorRuntimeSaved(runtime);
    expect(runtime.savedRevision).toBe(runtime.revision);
    expect(runtime.status).toBe("clean");

    runtime = commitEditorRuntime(
      runtime,
      { body: "Hello", title: "Saved Change" },
      { markSaved: true },
    );
    expect(runtime.status).toBe("clean");
    expect(runtime.savedRevision).toBe(runtime.revision);
  });

  test("undoes, redoes, refreshes validation and aspects, and preserves selection", () => {
    let runtime = createTestRuntime();
    runtime = commitEditorRuntime(
      runtime,
      { body: "one two", title: "Next" },
      { selection: "body" },
    );
    runtime = commitEditorRuntime(runtime, { body: "one two three", title: "" });

    expect(runtime.issues).toEqual([{ path: "title", message: "Title is required." }]);
    expect(runtime.aspectSnapshot.aspects["word-count"]?.value).toBe(3);
    expect(runtime.canUndo).toBe(true);

    runtime = undoEditorRuntime(runtime);
    expect(runtime.document).toEqual({ body: "one two", title: "Next" });
    expect(runtime.selection).toBe("body");
    expect(runtime.issues).toEqual([]);
    expect(runtime.aspectSnapshot.aspects["word-count"]?.value).toBe(2);
    expect(runtime.aspectSnapshot.aspects["word-count"]?.changed).toBe(true);
    expect(runtime.revision).toBe(3);
    expect(runtime.canRedo).toBe(true);

    runtime = redoEditorRuntime(runtime);
    expect(runtime.document.title).toBe("");
    expect(runtime.issues).toHaveLength(1);
    expect(runtime.aspectSnapshot.aspects["word-count"]?.value).toBe(3);
    expect(runtime.revision).toBe(4);
  });

  test("resets history and applies mark-saved behavior", () => {
    let runtime = createTestRuntime();
    runtime = commitEditorRuntime(runtime, { body: "Changed", title: "Changed" });

    runtime = resetEditorRuntime(runtime, { body: "Reset", title: "Reset" }, { markSaved: true });
    expect(runtime.document).toEqual({ body: "Reset", title: "Reset" });
    expect(runtime.history.past).toEqual([]);
    expect(runtime.history.future).toEqual([]);
    expect(runtime.canUndo).toBe(false);
    expect(runtime.status).toBe("clean");
  });

  test("reset can update selection without changing document revision", () => {
    const runtime = resetEditorRuntime(
      createTestRuntime(),
      { body: "Hello", title: "Draft" },
      {
        selection: "body",
      },
    );

    expect(runtime.document).toEqual({ body: "Hello", title: "Draft" });
    expect(runtime.selection).toBe("body");
    expect(runtime.revision).toBe(0);
    expect(runtime.status).toBe("clean");
  });

  test("selection changes do not mark dirty or increment revision", () => {
    const runtime = setEditorRuntimeSelection(createTestRuntime(), "body");

    expect(runtime.selection).toBe("body");
    expect(runtime.revision).toBe(0);
    expect(runtime.status).toBe("clean");
  });

  test("validates on demand", () => {
    const runtime = createEditorRuntime({
      initialDocument: { body: "Body", title: "" },
      validate,
    });

    expect(validateEditorRuntime(runtime).issues).toEqual([
      { path: "title", message: "Title is required." },
    ]);
  });

  test("re-runs validators when validation is requested", () => {
    let requiredTitle = false;
    const runtime = createEditorRuntime({
      initialDocument: { body: "Body", title: "" },
      validate: (document) =>
        requiredTitle && document.title.length === 0
          ? [{ path: "title", message: "Title is required." }]
          : [],
    });

    expect(runtime.issues).toEqual([]);
    requiredTitle = true;
    expect(validateEditorRuntime(runtime).issues).toEqual([
      { path: "title", message: "Title is required." },
    ]);
  });

  test("passes revision and origin to aspects across runtime transitions", () => {
    const seen: { revision: number; source: string | undefined }[] = [];
    const aspect = createEditorAspect<Document, string>({
      id: "origin-source",
      derive({ origin, revision }) {
        seen.push({ revision, source: origin?.source });
        return `${revision}:${origin?.source ?? "unknown"}`;
      },
    });
    const origin = { source: "initial" };
    let runtime = createEditorRuntime({
      aspects: [aspect],
      initialDocument: { body: "Hello", title: "Draft" },
      origin,
    });

    runtime = commitEditorRuntime(
      runtime,
      { body: "Hello", title: "Next" },
      {
        origin: { source: "commit" },
      },
    );
    runtime = commitEditorRuntime(
      runtime,
      { body: "Changed", title: "Next" },
      {
        origin: { source: "second-commit" },
      },
    );
    runtime = undoEditorRuntime(runtime, { origin: { source: "undo" } });
    runtime = redoEditorRuntime(runtime, { origin: { source: "redo" } });
    runtime = resetEditorRuntime(
      runtime,
      { body: "Reset", title: "Reset" },
      {
        origin: { source: "reset" },
      },
    );

    expect(runtime.aspectSnapshot.aspects["origin-source"]?.value).toBe("5:reset");
    expect(seen).toEqual([
      { revision: 0, source: "initial" },
      { revision: 1, source: "commit" },
      { revision: 2, source: "second-commit" },
      { revision: 3, source: "undo" },
      { revision: 4, source: "redo" },
      { revision: 5, source: "reset" },
    ]);
  });

  test("honors bounded history limits", () => {
    let runtime = createEditorRuntime({
      history: { limit: 1 },
      initialDocument: 1,
    });

    runtime = commitEditorRuntime(runtime, 2);
    runtime = commitEditorRuntime(runtime, 3);

    expect(runtime.history.past).toEqual([2]);
  });

  test("retains history equality and normalization options across transitions", () => {
    let runtime = createTestRuntime();

    runtime = commitEditorRuntime(runtime, { body: " Hello ", title: " Draft " });
    expect(runtime.revision).toBe(0);
    expect(runtime.document).toEqual({ body: "Hello", title: "Draft" });

    runtime = commitEditorRuntime(runtime, { body: " Changed ", title: " Next " });
    expect(runtime.document).toEqual({ body: "Changed", title: "Next" });

    runtime = resetEditorRuntime(runtime, { body: " Reset ", title: " Reset " });
    expect(runtime.document).toEqual({ body: "Reset", title: "Reset" });

    runtime = commitEditorRuntime(runtime, { body: " Again ", title: " Again " });
    runtime = undoEditorRuntime(runtime);
    expect(runtime.document).toEqual({ body: "Reset", title: "Reset" });

    runtime = redoEditorRuntime(runtime);
    expect(runtime.document).toEqual({ body: "Again", title: "Again" });
  });

  test("validation issues update after commit and reset", () => {
    let runtime = createTestRuntime();

    runtime = commitEditorRuntime(runtime, { body: "Body", title: "" });
    expect(runtime.issues).toEqual([{ path: "title", message: "Title is required." }]);

    runtime = resetEditorRuntime(runtime, { body: "Body", title: "Restored" });
    expect(runtime.issues).toEqual([]);
  });

  test("public runtime operations reject objects without runtime metadata", () => {
    const runtime = createTestRuntime();

    expect(() => commitEditorRuntime({ ...runtime }, { body: "Body", title: "Next" })).toThrow(
      "Editor runtime state must be created by createEditorRuntime.",
    );
  });
});

describe("editor runtime commands", () => {
  test("creates undo, redo, reset, and save commands with runtime disabled states", async () => {
    let runtime = createTestRuntime();
    const setRuntime = createRuntimeSetter(
      () => runtime,
      (nextRuntime) => {
        runtime = nextRuntime;
      },
    );

    let commands = createEditorRuntimeCommands({
      getResetDocument: () => ({ body: "Reset", title: "Reset" }),
      runtime,
      setRuntime,
    });

    expect(commands.map((command) => command.id)).toEqual(["undo", "redo", "reset", "save"]);
    expect(commands.find((command) => command.id === "undo")?.disabled).toBe(true);
    expect(commands.find((command) => command.id === "save")?.disabled).toBe(true);

    runtime = commitEditorRuntime(runtime, { body: "Changed", title: "Changed" });
    commands = createEditorRuntimeCommands({
      getResetDocument: () => ({ body: "Reset", title: "Reset" }),
      runtime,
      setRuntime,
    });

    expect(commands.find((command) => command.id === "undo")?.disabled).toBe(false);
    expect(commands.find((command) => command.id === "save")?.disabled).toBe(false);

    await commands.find((command) => command.id === "save")?.run?.(keyboardEvent);
    expect(runtime.status).toBe("clean");
  });

  test("allows disabled overrides to re-enable default-disabled commands", () => {
    const runtime = createTestRuntime();
    const save = createEditorRuntimeCommands({
      disabled: { save: false },
      getResetDocument: () => ({ body: "Reset", title: "Reset" }),
      runtime,
      setRuntime: () => {},
    }).find((command) => command.id === "save");

    expect(save?.disabled).toBe(false);
  });

  test("runs save callback before marking saved", async () => {
    let runtime = commitEditorRuntime(createTestRuntime(), { body: "Changed", title: "Changed" });
    const onSave = vi.fn(async (current: EditorRuntimeState<Document, string>) => {
      expect(current.status).toBe("dirty");
    });
    const setRuntime = createRuntimeSetter(
      () => runtime,
      (nextRuntime) => {
        runtime = nextRuntime;
      },
    );
    const save = createEditorRuntimeCommands({
      getResetDocument: () => ({ body: "Reset", title: "Reset" }),
      onSave,
      runtime,
      setRuntime,
    }).find((command) => command.id === "save");

    await save?.run?.(keyboardEvent);

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ status: "dirty" }));
    expect(runtime.status).toBe("clean");
  });
});

function createTestRuntime() {
  return createEditorRuntime<Document, string>({
    aspects: [wordCountAspect],
    history: historyOptions,
    initialDocument: { body: "Hello", title: "Draft" },
    validate,
  });
}

function createRuntimeSetter<TDocument, TSelection>(
  getRuntime: () => EditorRuntimeState<TDocument, TSelection>,
  setRuntime: (runtime: EditorRuntimeState<TDocument, TSelection>) => void,
) {
  return (
    updater: (
      runtime: EditorRuntimeState<TDocument, TSelection>,
    ) => EditorRuntimeState<TDocument, TSelection>,
  ) => {
    setRuntime(updater(getRuntime()));
  };
}

const keyboardEvent = {
  altKey: false,
  ctrlKey: false,
  key: "",
  metaKey: false,
  shiftKey: false,
  target: null,
};
