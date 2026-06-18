import { describe, expect, test, vi } from "vitest";
import {
  createEditorCommandRuntime,
  createEditorCommands,
  createEditorSnapshotHistoryCommands,
  defaultEditorSnapshotHistoryCommandHotkeys,
  defaultEditorSnapshotHistoryCommandLabels,
  getEditorCommandDiagnostics,
  getRunnableEditorCommands,
  resolveEditorCommands,
  type EditorContextualCommandDefinition,
  type EditorSnapshotHistoryCommandId,
} from "./commands.js";
import {
  commitEditorSnapshotHistory,
  createEditorSnapshotHistory,
  type EditorSnapshotHistory,
} from "./history.js";
import type { EditorHotkeyEvent } from "./hotkeys.js";
import {
  commitEditorRuntime,
  createEditorDocumentIoCommands,
  createEditorRuntime,
  defaultEditorDocumentIoCommandHotkeys,
  defaultEditorDocumentIoCommandLabels,
  type EditorDocumentIoCommandId,
} from "./runtime.js";

describe("generic editor command factory", () => {
  test("creates commands with include order, labels, hotkeys, disabled overrides, and run guards", async () => {
    const seen: string[] = [];
    const runBlocked = vi.fn();
    const runSave = vi.fn((_context: { canSave: boolean }, event: EditorHotkeyEvent) => {
      seen.push(event.key);
    });
    const commands = createEditorCommands<"save" | "blocked" | "reset", { canSave: boolean }>(
      [
        {
          disabled: (context) => !context.canSave,
          hotkeys: ["Mod+S"],
          id: "save",
          label: "Save",
          run: runSave,
        },
        {
          disabled: () => true,
          hotkeys: ["Mod+B"],
          id: "blocked",
          label: "Blocked",
          run: runBlocked,
        },
        {
          id: "reset",
          label: "Reset",
        },
      ] as const,
      { canSave: false },
      {
        disabled: { save: false },
        hotkeys: { save: ["Alt+S"] },
        include: ["blocked", "save"],
        labels: { save: "Persist" },
      },
    );

    expect(commands.map((command) => command.id)).toEqual(["blocked", "save"]);
    expect(commands[1]).toMatchObject({
      disabled: false,
      hotkeys: ["Alt+S"],
      label: "Persist",
    });

    await commands[0]?.run?.(event);
    await commands[1]?.run?.({ ...event, key: "s" });

    expect(runBlocked).not.toHaveBeenCalled();
    expect(runSave).toHaveBeenCalledOnce();
    expect(seen).toEqual(["s"]);
  });
});

describe("editor command runtime", () => {
  test("resolves the first enabled matching command and skips disabled or invalid shortcuts", () => {
    const input = document.createElement("input");
    const runtime = createEditorCommandRuntime<"disabled" | "invalid" | "first" | "second">({
      commands: [
        { disabled: true, hotkeys: ["Mod+K"], id: "disabled", label: "Disabled" },
        { hotkeys: ["Mod+K+P"], id: "invalid", label: "Invalid" },
        { hotkeys: ["Mod+K"], id: "first", label: "First" },
        { hotkeys: ["Mod+K"], id: "second", label: "Second" },
      ],
    });

    expect(runtime.resolve(hotkeyEvent({ key: "k", metaKey: true }))).toMatchObject({
      commandId: "first",
      hotkey: "Mod+K",
    });
    expect(runtime.resolve(hotkeyEvent({ key: "k", metaKey: true, target: input }))).toBeNull();
    expect(runtime.resolve(hotkeyEvent({ key: "p", metaKey: true }))).toBeNull();
  });

  test("applies runtime disabled, read-only, scope, editable target, and no-match guards", async () => {
    const input = document.createElement("input");
    const command = { hotkeys: ["Mod+K"], id: "palette", label: "Palette", run: vi.fn() } as const;

    await expect(
      createEditorCommandRuntime({ commands: [command], disabled: true }).run(
        hotkeyEvent({ key: "k", metaKey: true }),
      ),
    ).resolves.toEqual({ reason: "runtime-disabled", status: "ignored" });
    await expect(
      createEditorCommandRuntime({ commands: [command], readOnly: true }).run(
        hotkeyEvent({ key: "k", metaKey: true }),
      ),
    ).resolves.toEqual({ reason: "read-only", status: "ignored" });
    await expect(
      createEditorCommandRuntime({ commands: [command], isInScope: () => false }).run(
        hotkeyEvent({ key: "k", metaKey: true }),
      ),
    ).resolves.toEqual({ reason: "out-of-scope", status: "ignored" });
    await expect(
      createEditorCommandRuntime({ commands: [command] }).run(
        hotkeyEvent({ key: "k", metaKey: true, target: input }),
      ),
    ).resolves.toEqual({ reason: "editable-target", status: "ignored" });
    await expect(
      createEditorCommandRuntime({ commands: [command] }).run(hotkeyEvent({ key: "x" })),
    ).resolves.toEqual({ reason: "no-match", status: "ignored" });

    expect(command.run).not.toHaveBeenCalled();
  });

  test("allows editable targets when requested and reports missing handlers", async () => {
    const input = document.createElement("input");
    const runtime = createEditorCommandRuntime({
      allowEditableTargets: true,
      commands: [{ hotkeys: ["Mod+K"], id: "palette", label: "Palette" }],
    });

    await expect(
      runtime.run(hotkeyEvent({ key: "k", metaKey: true, target: input })),
    ).resolves.toEqual({ commandId: "palette", reason: "missing-run", status: "ignored" });
  });

  test("prevents defaults, awaits runnable commands, and exposes diagnostics", async () => {
    const seen: string[] = [];
    const preventDefault = vi.fn();
    const runtime = createEditorCommandRuntime<"palette" | "search" | "broken" | "empty">({
      commands: [
        {
          hotkeys: ["Mod+K"],
          id: "palette",
          label: "Palette",
          run: async () => {
            seen.push("palette");
          },
        },
        { hotkeys: ["Mod+K"], id: "search", label: "Search" },
        { hotkeys: ["Mod"], id: "broken", label: "Broken" },
        { id: "empty", label: " " },
      ],
    });

    await expect(
      runtime.run({ ...hotkeyEvent({ key: "k", metaKey: true }), preventDefault }),
    ).resolves.toMatchObject({
      commandId: "palette",
      hotkey: "Mod+K",
      status: "ran",
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(seen).toEqual(["palette"]);
    expect(runtime.diagnostics()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          commandId: "broken",
          message: 'Invalid hotkey "Mod".',
        }),
        expect.objectContaining({
          commandId: "empty",
          message: "Command labels should not be empty.",
        }),
        expect.objectContaining({
          commandId: "palette",
          message: 'Hotkey "Mod+K" conflicts with command "search".',
        }),
      ]),
    );
  });
});

describe("snapshot history commands", () => {
  test("creates default undo, redo, and reset commands in order with labels and hotkeys", () => {
    const history = createEditorSnapshotHistory(1);
    const commands = createEditorSnapshotHistoryCommands({
      getResetDocument: () => 0,
      history,
      setHistory: () => {},
    });

    expect(commands.map((command) => command.id)).toEqual(["undo", "redo", "reset"]);
    expect(commands.map((command) => command.label)).toEqual([
      defaultEditorSnapshotHistoryCommandLabels.undo,
      defaultEditorSnapshotHistoryCommandLabels.redo,
      defaultEditorSnapshotHistoryCommandLabels.reset,
    ]);
    expect(commands.map((command) => command.hotkeys)).toEqual([
      defaultEditorSnapshotHistoryCommandHotkeys.undo,
      defaultEditorSnapshotHistoryCommandHotkeys.redo,
      defaultEditorSnapshotHistoryCommandHotkeys.reset,
    ]);
  });

  test("marks undo and redo disabled from history flags", () => {
    const history = createEditorSnapshotHistory(1);
    const commands = createEditorSnapshotHistoryCommands({
      getResetDocument: () => 0,
      history,
      setHistory: () => {},
    });

    expect(commands.find((command) => command.id === "undo")?.disabled).toBe(true);
    expect(commands.find((command) => command.id === "redo")?.disabled).toBe(true);
    expect(commands.find((command) => command.id === "reset")?.disabled).toBe(false);
  });

  test("undo and redo move snapshot history", () => {
    let history = createEditorSnapshotHistory(1);
    history = commitEditorSnapshotHistory(history, 2);
    history = commitEditorSnapshotHistory(history, 3);
    const setHistory = createHistorySetter(
      () => history,
      (nextHistory) => {
        history = nextHistory;
      },
    );

    const undo = getCommand(
      createEditorSnapshotHistoryCommands({
        getResetDocument: () => 0,
        history,
        setHistory,
      }),
      "undo",
    );
    undo.run?.(event);

    expect(history.present).toBe(2);
    expect(history.future).toEqual([3]);

    const redo = getCommand(
      createEditorSnapshotHistoryCommands({
        getResetDocument: () => 0,
        history,
        setHistory,
      }),
      "redo",
    );
    redo.run?.(event);

    expect(history.present).toBe(3);
    expect(history.future).toEqual([]);
  });

  test("reset uses the provided document, clears history, and normalizes", () => {
    let history = createEditorSnapshotHistory({ value: 1 });
    history = commitEditorSnapshotHistory(history, { value: 2 });
    const setHistory = createHistorySetter(
      () => history,
      (nextHistory) => {
        history = nextHistory;
      },
    );

    const reset = getCommand(
      createEditorSnapshotHistoryCommands({
        getResetDocument: () => ({ value: 5 }),
        history,
        historyOptions: {
          normalize: (document) => ({ value: document.value * 2 }),
        },
        setHistory,
      }),
      "reset",
    );
    reset.run?.(event);

    expect(history).toMatchObject({
      canRedo: false,
      canUndo: false,
      future: [],
      past: [],
      present: { value: 10 },
    });
  });

  test("disabled overrides prevent running and callbacks", () => {
    let history = createEditorSnapshotHistory(1);
    history = commitEditorSnapshotHistory(history, 2);
    const onRun = vi.fn();
    const setHistory = vi.fn();

    const commands = createEditorSnapshotHistoryCommands({
      disabled: {
        reset: true,
        undo: true,
      },
      getResetDocument: () => 0,
      history,
      onRun,
      setHistory,
    });

    getCommand(commands, "undo").run?.(event);
    getCommand(commands, "reset").run?.(event);

    expect(setHistory).not.toHaveBeenCalled();
    expect(onRun).not.toHaveBeenCalled();
  });

  test("include preserves requested commands and order", () => {
    const commands = createEditorSnapshotHistoryCommands({
      getResetDocument: () => 0,
      history: createEditorSnapshotHistory(1),
      include: ["reset", "undo"],
      setHistory: () => {},
    });

    expect(commands.map((command) => command.id)).toEqual(["reset", "undo"]);
  });

  test("labels and hotkeys override defaults", () => {
    const commands = createEditorSnapshotHistoryCommands({
      getResetDocument: () => 0,
      history: createEditorSnapshotHistory(1),
      hotkeys: {
        reset: ["Alt+R"],
      },
      labels: {
        reset: "Restore",
      },
      include: ["reset"],
      setHistory: () => {},
    });

    expect(commands[0]).toMatchObject({
      hotkeys: ["Alt+R"],
      label: "Restore",
    });
  });

  test("onRun receives the command id and event after a successful run", async () => {
    let history = createEditorSnapshotHistory(1);
    history = commitEditorSnapshotHistory(history, 2);
    const onRun = vi.fn();
    const setHistory = createHistorySetter(
      () => history,
      (nextHistory) => {
        history = nextHistory;
      },
    );

    const undo = getCommand(
      createEditorSnapshotHistoryCommands({
        getResetDocument: () => 0,
        history,
        onRun,
        setHistory,
      }),
      "undo",
    );
    await undo.run?.(event);

    expect(onRun).toHaveBeenCalledWith({ event, id: "undo" });
  });
});

describe("document IO commands", () => {
  test("creates default save, import, and export commands in order with labels and hotkeys", () => {
    const commands = createEditorDocumentIoCommands({
      runtime: createEditorRuntime({ initialDocument: { title: "Draft" } }),
    });

    expect(commands.map((command) => command.id)).toEqual(["save", "import", "export"]);
    expect(commands.map((command) => command.label)).toEqual([
      defaultEditorDocumentIoCommandLabels.save,
      defaultEditorDocumentIoCommandLabels.import,
      defaultEditorDocumentIoCommandLabels.export,
    ]);
    expect(commands.map((command) => command.hotkeys)).toEqual([
      defaultEditorDocumentIoCommandHotkeys.save,
      defaultEditorDocumentIoCommandHotkeys.import,
      defaultEditorDocumentIoCommandHotkeys.export,
    ]);
  });

  test("disables save while clean and enables save when dirty", () => {
    const cleanRuntime = createEditorRuntime({ initialDocument: { title: "Draft" } });
    const dirtyRuntime = commitEditorRuntime(cleanRuntime, { title: "Changed" });

    expect(
      getCommand(createEditorDocumentIoCommands({ runtime: cleanRuntime }), "save").disabled,
    ).toBe(true);
    expect(
      getCommand(createEditorDocumentIoCommands({ runtime: dirtyRuntime }), "save").disabled,
    ).toBe(false);
  });

  test("allows disabled overrides for save, import, and export", () => {
    const runtime = createEditorRuntime({ initialDocument: { title: "Draft" } });
    const commands = createEditorDocumentIoCommands({
      export: { disabled: true, run: () => {} },
      import: { disabled: true, run: () => {} },
      runtime,
      save: { disabled: false, run: () => {} },
    });

    expect(getCommand(commands, "save").disabled).toBe(false);
    expect(getCommand(commands, "import").disabled).toBe(true);
    expect(getCommand(commands, "export").disabled).toBe(true);
  });

  test("honors include ordering and label and hotkey overrides", () => {
    const commands = createEditorDocumentIoCommands({
      hotkeys: {
        export: ["Mod+E"],
      },
      include: ["export", "save"],
      labels: {
        export: "Download JSON",
      },
      runtime: createEditorRuntime({ initialDocument: { title: "Draft" } }),
    });

    expect(commands.map((command) => command.id)).toEqual(["export", "save"]);
    expect(commands[0]).toMatchObject({
      hotkeys: ["Mod+E"],
      label: "Download JSON",
    });
  });

  test("runs save, import, and export handlers with the expected runtime context", async () => {
    const runtime = commitEditorRuntime(
      createEditorRuntime({ initialDocument: { title: "Draft" } }),
      { title: "Changed" },
    );
    const save = vi.fn(async (currentRuntime: typeof runtime) => {
      expect(currentRuntime).toBe(runtime);
    });
    const importJson = vi.fn(async () => {});
    const exportJson = vi.fn(async (currentRuntime: typeof runtime) => {
      expect(currentRuntime.document).toEqual({ title: "Changed" });
    });
    const commands = createEditorDocumentIoCommands({
      export: { run: exportJson },
      import: { run: importJson },
      runtime,
      save: { run: save },
    });

    await getCommand(commands, "save").run?.(event);
    await getCommand(commands, "import").run?.(event);
    await getCommand(commands, "export").run?.(event);

    expect(save).toHaveBeenCalledOnce();
    expect(importJson).toHaveBeenCalledOnce();
    expect(exportJson).toHaveBeenCalledOnce();
  });

  test("does not run disabled handlers", async () => {
    const runtime = commitEditorRuntime(
      createEditorRuntime({ initialDocument: { title: "Draft" } }),
      { title: "Changed" },
    );
    const save = vi.fn();
    const importJson = vi.fn();
    const exportJson = vi.fn();
    const commands = createEditorDocumentIoCommands({
      export: { disabled: true, run: exportJson },
      import: { disabled: true, run: importJson },
      runtime,
      save: { disabled: true, run: save },
    });

    await getCommand(commands, "save").run?.(event);
    await getCommand(commands, "import").run?.(event);
    await getCommand(commands, "export").run?.(event);

    expect(save).not.toHaveBeenCalled();
    expect(importJson).not.toHaveBeenCalled();
    expect(exportJson).not.toHaveBeenCalled();
  });
});

describe("contextual editor commands", () => {
  test("resolves availability, checked state, groups, menus, and read-only state", async () => {
    const seen: string[] = [];
    const definitions: readonly EditorContextualCommandDefinition<
      "duplicate" | "delete",
      { enabled: boolean },
      string | null
    >[] = [
      {
        canRun: ({ selection }) => selection !== null,
        checked: ({ document }) => document.enabled,
        group: "edit",
        hotkeys: ["Mod+D"],
        id: "duplicate",
        label: "Duplicate",
        menu: { order: 1 },
        run: ({ selection }) => {
          seen.push(String(selection));
        },
      },
      {
        id: "delete",
        label: "Delete",
      },
    ] as const;
    const commands = resolveEditorCommands(definitions, {
      document: { enabled: true },
      selection: "node-a",
    });

    expect(commands[0]).toMatchObject({
      checked: true,
      disabled: false,
      group: "edit",
      menu: { order: 1 },
    });
    expect(getRunnableEditorCommands(commands).map((command) => command.id)).toEqual([
      "duplicate",
      "delete",
    ]);

    await commands[0].run?.(event);
    expect(seen).toEqual(["node-a"]);

    expect(
      resolveEditorCommands(definitions, {
        document: { enabled: true },
        readOnly: true,
        selection: "node-a",
      }).map((command) => command.disabled),
    ).toEqual([true, true]);
  });

  test("returns only enabled commands and no-op runs commands without handlers", async () => {
    const commands = resolveEditorCommands(
      [
        {
          id: "rename",
          label: "Rename",
          run: () => {},
        },
        {
          canRun: () => false,
          id: "delete",
          label: "Delete",
        },
        {
          id: "inspect",
          label: "Inspect",
        },
      ],
      { document: { enabled: true }, selection: "node-a" },
    );

    expect(getRunnableEditorCommands(commands).map((command) => command.id)).toEqual([
      "rename",
      "inspect",
    ]);
    await expect(commands.find((command) => command.id === "inspect")?.run?.(event)).resolves.toBe(
      undefined,
    );
  });
});

describe("editor command diagnostics", () => {
  test("reports duplicate ids, invalid hotkeys, conflicts, and empty labels", () => {
    const diagnostics = getEditorCommandDiagnostics([
      { hotkeys: ["Mod+K"], id: "palette", label: "Palette" },
      { hotkeys: ["Mod+K"], id: "search", label: "Search" },
      { hotkeys: ["Mod"], id: "broken", label: "Broken" },
      { id: "empty", label: " " },
      { id: "palette", label: "Duplicate" },
    ]);

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        {
          commandId: "palette",
          message: 'Duplicate command id "palette".',
          path: "4.id",
          severity: "error",
        },
        {
          commandId: "broken",
          message: 'Invalid hotkey "Mod".',
          path: "2.hotkeys.0",
          severity: "error",
        },
        {
          commandId: "empty",
          message: "Command labels should not be empty.",
          path: "3.label",
          severity: "warning",
        },
        {
          commandId: "palette",
          message: 'Hotkey "Mod+K" conflicts with command "search".',
          path: "0.hotkeys.0",
          severity: "warning",
        },
      ]),
    );
  });

  test("ignores hotkey conflicts from disabled commands", () => {
    const diagnostics = getEditorCommandDiagnostics([
      { hotkeys: ["Mod+K"], id: "palette", label: "Palette" },
      { disabled: true, hotkeys: ["Mod+K"], id: "search", label: "Search" },
    ]);

    expect(diagnostics).toEqual([]);
  });
});

function createHistorySetter<TDocument>(
  getHistory: () => EditorSnapshotHistory<TDocument>,
  setHistory: (history: EditorSnapshotHistory<TDocument>) => void,
) {
  return (
    updater: (history: EditorSnapshotHistory<TDocument>) => EditorSnapshotHistory<TDocument>,
  ) => {
    setHistory(updater(getHistory()));
  };
}

function getCommand(
  commands: readonly { id: EditorSnapshotHistoryCommandId | EditorDocumentIoCommandId }[],
  id: EditorSnapshotHistoryCommandId | EditorDocumentIoCommandId,
) {
  const command = commands.find((candidate) => candidate.id === id);
  expect(command).toBeDefined();
  return command as NonNullable<typeof command> & {
    disabled?: boolean;
    hotkeys?: readonly string[];
    label?: string;
    run?: (event: EditorHotkeyEvent) => void | Promise<void>;
  };
}

const event: EditorHotkeyEvent = {
  altKey: false,
  ctrlKey: false,
  key: "",
  metaKey: false,
  shiftKey: false,
  target: null,
};

function hotkeyEvent(
  partial: Partial<EditorHotkeyEvent> & { key: string; preventDefault?: () => void },
): EditorHotkeyEvent & { preventDefault?: () => void } {
  return {
    altKey: partial.altKey ?? false,
    ctrlKey: partial.ctrlKey ?? false,
    key: partial.key,
    metaKey: partial.metaKey ?? false,
    preventDefault: partial.preventDefault,
    shiftKey: partial.shiftKey ?? false,
    target: partial.target ?? document.createElement("div"),
  };
}
