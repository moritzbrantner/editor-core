import { describe, expect, test } from "vitest";
import { createEditorAspect } from "./aspects.js";
import {
  createEditorPluginRegistry,
  getEditorPluginDiagnostics,
  resolveEditorPluginCommands,
  resolveEditorPluginRuntimeOptions,
} from "./plugins.js";

type Document = {
  body: string;
  title: string;
};

describe("editor plugins", () => {
  test("creates a registry and preserves plugin order", () => {
    const registry = createEditorPluginRegistry<Document, string>([
      { commands: [{ id: "a", label: "A" }], id: "first" },
      { commands: [{ id: "b", label: "B" }], id: "second" },
    ]);

    expect(registry.plugins.map((plugin) => plugin.id)).toEqual(["first", "second"]);
    expect(registry.commands.map((command) => command.id)).toEqual(["a", "b"]);
  });

  test("composes validators and aspects into runtime options", () => {
    const titleLength = createEditorAspect<Document, number>({
      derive: ({ document }) => document.title.length,
      id: "title-length",
    });
    const registry = createEditorPluginRegistry<Document, string>([
      {
        aspects: [titleLength],
        id: "metadata",
        validators: [
          (document) => (document.title ? [] : [{ message: "Title required", path: "title" }]),
        ],
      },
    ]);

    const options = resolveEditorPluginRuntimeOptions(registry, {
      initialDocument: { body: "", title: "" },
      validate: (document) => (document.body ? [] : [{ message: "Body required", path: "body" }]),
    });

    expect(options.aspects).toEqual([titleLength]);
    expect(options.validate?.({ body: "", title: "" })).toEqual([
      { message: "Body required", path: "body" },
      { message: "Title required", path: "title" },
    ]);
  });

  test("composes operation preflight hooks", () => {
    const registry = createEditorPluginRegistry<Document, string>([
      {
        id: "ops",
        operationPreflight: [
          ({ operation }) =>
            operation.id === "blocked" ? [{ message: "Blocked", path: "operation.id" }] : [],
        ],
      },
    ]);
    const options = resolveEditorPluginRuntimeOptions(registry, {
      initialDocument: { body: "", title: "" },
    });

    expect(
      options.preflight({
        document: { body: "", title: "" },
        operation: { apply: (document: Document) => document, id: "blocked" },
        runtime: {} as never,
      }),
    ).toEqual([{ message: "Blocked", path: "operation.id" }]);
  });

  test("resolves commands from plugins", async () => {
    const registry = createEditorPluginRegistry<Document, string>([
      {
        commands: [
          {
            canRun: ({ selection }) => selection === "title",
            id: "rename",
            label: "Rename",
            run: ({ document }) => {
              document.title = "Renamed";
            },
          },
        ],
        id: "commands",
      },
    ]);
    const document = { body: "", title: "Draft" };
    const commands = resolveEditorPluginCommands(registry, {
      document,
      selection: "title",
    });

    expect(commands[0]).toMatchObject({ disabled: false, id: "rename" });
    await commands[0]?.run?.(keyboardEvent);
    expect(document.title).toBe("Renamed");
  });

  test("reports duplicate plugin, command, and aspect ids", () => {
    const registry = createEditorPluginRegistry<Document, string>([
      {
        aspects: [createEditorAspect({ derive: () => 1, id: "metadata" })],
        commands: [{ id: "rename", label: "Rename" }],
        id: "duplicate",
      },
      {
        aspects: [createEditorAspect({ derive: () => 2, id: "metadata" })],
        commands: [{ id: "rename", label: "Rename Again" }],
        id: "duplicate",
      },
    ]);

    expect(getEditorPluginDiagnostics(registry).map((diagnostic) => diagnostic.message)).toEqual([
      'Duplicate plugin id "duplicate".',
      'Duplicate aspect id "metadata".',
      'Duplicate command id "rename".',
    ]);
  });
});

const keyboardEvent = new KeyboardEvent("keydown");
