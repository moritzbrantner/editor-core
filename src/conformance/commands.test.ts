import { describe, expect, test } from "vitest";

import { checkEditorReadOnlyCommandConformance } from "./commands.js";

type Document = { value: number };
type CommandId = "increment";

function createMutationCase() {
  let document: Document = { value: 0 };

  return {
    commands: [
      {
        hotkeys: ["Mod+I"],
        id: "increment" as const,
        label: "Increment",
        run() {
          document = { value: document.value + 1 };
        },
      },
    ],
    event: {
      altKey: false,
      ctrlKey: true,
      key: "i",
      metaKey: false,
      shiftKey: false,
      target: null,
    },
    getDocument: () => document,
  };
}

describe("read-only command conformance", () => {
  test("accepts a command that mutates when writable and is blocked when read-only", async () => {
    const result = await checkEditorReadOnlyCommandConformance<Document, CommandId>({
      cases: [{ create: createMutationCase, name: "increment" }],
    });

    expect(result).toEqual({ ok: true, issues: [] });
  });

  test("rejects vacuous cases whose writable command does not mutate", async () => {
    const result = await checkEditorReadOnlyCommandConformance<Document, CommandId>({
      cases: [
        {
          name: "no-op",
          create() {
            const document: Document = { value: 0 };
            return {
              commands: [
                {
                  hotkeys: ["Mod+I"],
                  id: "increment" as const,
                  label: "Increment",
                  run() {},
                },
              ],
              event: {
                altKey: false,
                ctrlKey: true,
                key: "i",
                metaKey: false,
                shiftKey: false,
                target: null,
              },
              getDocument: () => document,
            };
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        capability: "command",
        path: "no-op",
        message: expect.stringContaining("vacuous"),
      }),
    ]);
  });

  test("rejects cases whose writable event does not invoke the registered command", async () => {
    const result = await checkEditorReadOnlyCommandConformance<Document, CommandId>({
      cases: [
        {
          name: "wrong-event",
          create() {
            const setup = createMutationCase();
            return {
              ...setup,
              event: { ...setup.event, key: "x" },
            };
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        capability: "command",
        path: "wrong-event",
        message: expect.stringContaining("did not run"),
      }),
    ]);
  });
});
