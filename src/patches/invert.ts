import type { EditorPatch } from "./types.js";

export function invertEditorPatch(patch: EditorPatch): EditorPatch {
  return [...patch].reverse().map((operation) => {
    if (operation.op === "add") {
      return { op: "remove", oldValue: operation.value, path: operation.path };
    }

    if (operation.op === "remove") {
      return { op: "add", path: operation.path, value: operation.oldValue };
    }

    return {
      op: "replace",
      oldValue: operation.value,
      path: operation.path,
      value: operation.oldValue,
    };
  });
}

export function isEditorPatchEmpty(patch: EditorPatch): boolean {
  return patch.length === 0;
}
