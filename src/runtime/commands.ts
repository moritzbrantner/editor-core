import type { EditorCommandDefinition, EditorHotkeyMap } from "../hotkeys.js";
import {
  markEditorRuntimeSaved,
  redoEditorRuntime,
  resetEditorRuntime,
  undoEditorRuntime,
} from "./state.js";
import type { EditorRuntimeState } from "./types.js";

export type EditorRuntimeCommandId = "undo" | "redo" | "reset" | "save";

export const defaultEditorRuntimeCommandHotkeys: EditorHotkeyMap<EditorRuntimeCommandId> = {
  redo: ["Mod+Shift+Z"],
  reset: ["Mod+Backspace"],
  save: ["Mod+Alt+S"],
  undo: ["Mod+Z"],
};

export const defaultEditorRuntimeCommandLabels: Record<EditorRuntimeCommandId, string> = {
  redo: "Redo",
  reset: "Reset",
  save: "Save",
  undo: "Undo",
};

export type EditorRuntimeCommandsOptions<TDocument, TSelection = unknown> = {
  runtime: EditorRuntimeState<TDocument, TSelection>;
  setRuntime: (
    updater: (
      runtime: EditorRuntimeState<TDocument, TSelection>,
    ) => EditorRuntimeState<TDocument, TSelection>,
  ) => void;
  getResetDocument: () => TDocument;
  onSave?: (runtime: EditorRuntimeState<TDocument, TSelection>) => void | Promise<void>;
  hotkeys?: Partial<EditorHotkeyMap<EditorRuntimeCommandId>>;
  labels?: Partial<Record<EditorRuntimeCommandId, string>>;
  include?: readonly EditorRuntimeCommandId[];
  disabled?: Partial<Record<EditorRuntimeCommandId, boolean>>;
};

const defaultEditorRuntimeCommandOrder: readonly EditorRuntimeCommandId[] = [
  "undo",
  "redo",
  "reset",
  "save",
];

export function createEditorRuntimeCommands<TDocument, TSelection = unknown>(
  options: EditorRuntimeCommandsOptions<TDocument, TSelection>,
): readonly EditorCommandDefinition<EditorRuntimeCommandId>[] {
  const include = options.include ?? defaultEditorRuntimeCommandOrder;

  return include.map((id) => {
    const disabled = isEditorRuntimeCommandDisabled(id, options);

    return {
      disabled,
      hotkeys: options.hotkeys?.[id] ?? defaultEditorRuntimeCommandHotkeys[id],
      id,
      label: options.labels?.[id] ?? defaultEditorRuntimeCommandLabels[id],
      run: async () => {
        if (disabled) {
          return;
        }

        if (id === "undo") {
          options.setRuntime(undoEditorRuntime);
          return;
        }

        if (id === "redo") {
          options.setRuntime(redoEditorRuntime);
          return;
        }

        if (id === "reset") {
          options.setRuntime((runtime) =>
            resetEditorRuntime(runtime, options.getResetDocument(), { markSaved: true }),
          );
          return;
        }

        if (options.onSave) {
          await options.onSave(options.runtime);
        }
        options.setRuntime(markEditorRuntimeSaved);
      },
    };
  });
}

function isEditorRuntimeCommandDisabled<TDocument, TSelection>(
  id: EditorRuntimeCommandId,
  options: EditorRuntimeCommandsOptions<TDocument, TSelection>,
): boolean {
  if (hasEditorRuntimeDisabledOverride(id, options.disabled)) {
    return options.disabled[id] === true;
  }

  if (id === "undo") {
    return !options.runtime.canUndo;
  }

  if (id === "redo") {
    return !options.runtime.canRedo;
  }

  if (id === "save") {
    return options.runtime.status === "clean";
  }

  return false;
}

function hasEditorRuntimeDisabledOverride(
  id: EditorRuntimeCommandId,
  disabled: Partial<Record<EditorRuntimeCommandId, boolean>> | undefined,
): disabled is Partial<Record<EditorRuntimeCommandId, boolean>> {
  return disabled ? Object.hasOwn(disabled, id) : false;
}
