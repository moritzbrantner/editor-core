import type { EditorCommandDefinition, EditorHotkeyMap } from "../hotkeys.js";
import { redoEditorOperationRuntime, undoEditorOperationRuntime } from "./runtime.js";
import type {
  EditorOperationRuntimeCommandId,
  EditorOperationRuntimeCommandsOptions,
} from "./types.js";

export const defaultEditorOperationRuntimeCommandHotkeys: EditorHotkeyMap<EditorOperationRuntimeCommandId> =
  {
    redo: ["Mod+Shift+Z"],
    undo: ["Mod+Z"],
  };

export const defaultEditorOperationRuntimeCommandLabels: Record<
  EditorOperationRuntimeCommandId,
  string
> = {
  redo: "Redo",
  undo: "Undo",
};

export function createEditorOperationRuntimeCommands<TDocument, TSelection = unknown>(
  options: EditorOperationRuntimeCommandsOptions<TDocument, TSelection>,
): readonly EditorCommandDefinition<EditorOperationRuntimeCommandId>[] {
  return (["undo", "redo"] as const).map((id) => {
    const disabled = isEditorOperationRuntimeCommandDisabled(id, options);
    return {
      disabled,
      hotkeys: options.hotkeys?.[id] ?? defaultEditorOperationRuntimeCommandHotkeys[id],
      id,
      label: options.labels?.[id] ?? defaultEditorOperationRuntimeCommandLabels[id],
      run: () => {
        if (disabled) {
          return;
        }

        options.setEditor(id === "undo" ? undoEditorOperationRuntime : redoEditorOperationRuntime);
      },
    };
  });
}

function isEditorOperationRuntimeCommandDisabled<TDocument, TSelection>(
  id: EditorOperationRuntimeCommandId,
  options: EditorOperationRuntimeCommandsOptions<TDocument, TSelection>,
): boolean {
  if (options.disabled?.[id]) {
    return true;
  }

  return id === "undo" ? !options.editor.canUndo : !options.editor.canRedo;
}
