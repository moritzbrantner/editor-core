import { describe, expect, test } from "vitest";
import {
  formatEditorShortcutLabel,
  getEditorCommandIdFromKeyboardEvent,
  getEditorHotkeyConflicts,
  getEditorHotkeyFromKeyboardEvent,
  isEditorEditableTarget,
  isEditorHotkeyValid,
  matchesEditorHotkey,
  parseEditorHotkey,
} from "./hotkeys.js";

describe("hotkeys", () => {
  test("matches modifiers and normalized keys", () => {
    expect(matchesEditorHotkey(event({ key: "z", metaKey: true }), "Mod+Z")).toBe(true);
    expect(
      matchesEditorHotkey(event({ key: "Z", ctrlKey: true, shiftKey: true }), "Mod+Shift+Z"),
    ).toBe(true);
    expect(matchesEditorHotkey(event({ key: "Delete" }), "Delete")).toBe(true);
    expect(matchesEditorHotkey(event({ key: "Backspace" }), "Backspace")).toBe(true);
    expect(matchesEditorHotkey(event({ key: " " }), "Space")).toBe(true);
    expect(matchesEditorHotkey(event({ key: "ArrowLeft" }), "ArrowLeft")).toBe(true);
    expect(matchesEditorHotkey(event({ key: "Home", altKey: true }), "Alt+Home")).toBe(true);
    expect(matchesEditorHotkey(event({ key: "End", shiftKey: true }), "Shift+End")).toBe(true);
    expect(matchesEditorHotkey(event({ key: "z", altKey: true, metaKey: true }), "Mod+Z")).toBe(
      false,
    );
  });

  test("suppresses editable targets and resolves commands", () => {
    const input = document.createElement("input");
    expect(isEditorEditableTarget(input)).toBe(true);
    expect(
      getEditorCommandIdFromKeyboardEvent(event({ key: "a", metaKey: true, target: input }), [
        { id: "select-all", label: "Select all", hotkeys: ["Mod+A"] },
      ]),
    ).toBeNull();

    const editor = document.createElement("div");
    expect(
      getEditorCommandIdFromKeyboardEvent(event({ key: "a", metaKey: true, target: editor }), [
        { id: "select-all", label: "Select all", hotkeys: ["Mod+A"] },
      ]),
    ).toBe("select-all");
  });

  test("ignores invalid hotkeys and editable targets when resolving command ids", () => {
    const input = document.createElement("input");
    expect(
      getEditorCommandIdFromKeyboardEvent(event({ key: "k", metaKey: true, target: input }), [
        { hotkeys: ["Mod+K"], id: "palette", label: "Palette" },
      ]),
    ).toBeNull();
    expect(
      getEditorCommandIdFromKeyboardEvent(event({ key: "p", metaKey: true }), [
        { hotkeys: ["Mod+K+P"], id: "palette", label: "Palette" },
        { hotkeys: ["Mod+P"], id: "print", label: "Print" },
      ]),
    ).toBe("print");
  });

  test("captures labels and detects conflicts", () => {
    expect(getEditorHotkeyFromKeyboardEvent(event({ key: "d", ctrlKey: true }))).toBe("Mod+D");
    expect(formatEditorShortcutLabel("mod+shift+delete")).toBe("Mod+Shift+Delete");
    expect(
      getEditorHotkeyConflicts<"delete" | "duplicate" | "details">(
        "duplicate",
        "Mod+D",
        {
          delete: ["Delete"],
          duplicate: ["Mod+D"],
          details: ["ctrl+d"],
        },
        [{ id: "delete", label: "Delete" }],
      ),
    ).toEqual(["details"]);
  });

  test("handles explicit platform modifiers and rejects malformed multi-key shortcuts", () => {
    expect(
      matchesEditorHotkey(event({ key: "k", ctrlKey: true, metaKey: true }), "Ctrl+Meta+K"),
    ).toBe(true);
    expect(matchesEditorHotkey(event({ key: "k", ctrlKey: true }), "Ctrl+Meta+K")).toBe(false);
    expect(formatEditorShortcutLabel("A+B")).toBe("A+B");
    expect(matchesEditorHotkey(event({ key: "b" }), "A+B")).toBe(false);
    expect(parseEditorHotkey("A+B")).toBeNull();
    expect(isEditorHotkeyValid("Ctrl+K")).toBe(true);
    expect(isEditorHotkeyValid("Ctrl+K+P")).toBe(false);
    expect(
      getEditorHotkeyConflicts<"ctrl" | "meta">("ctrl", "Ctrl+K", {
        ctrl: ["Ctrl+K"],
        meta: ["Meta+K"],
      }),
    ).toEqual(["meta"]);
    expect(
      getEditorHotkeyConflicts<"invalid" | "valid">("invalid", "K+P", {
        invalid: ["K+P"],
        valid: ["Mod+K"],
      }),
    ).toEqual([]);
  });
});

function event(
  partial: Partial<KeyboardEvent> & { key: string },
): Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey" | "target"> {
  return {
    altKey: partial.altKey ?? false,
    ctrlKey: partial.ctrlKey ?? false,
    key: partial.key,
    metaKey: partial.metaKey ?? false,
    shiftKey: partial.shiftKey ?? false,
    target: partial.target ?? document.createElement("div"),
  };
}
