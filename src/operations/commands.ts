import { createEditorCommands } from "../commands.js";
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
  return createEditorCommands(
    [
      {
        disabled: (context) => !context.editor.canUndo,
        hotkeys: defaultEditorOperationRuntimeCommandHotkeys.undo,
        id: "undo",
        label: defaultEditorOperationRuntimeCommandLabels.undo,
        run: (context) => {
          context.setEditor(undoEditorOperationRuntime);
        },
      },
      {
        disabled: (context) => !context.editor.canRedo,
        hotkeys: defaultEditorOperationRuntimeCommandHotkeys.redo,
        id: "redo",
        label: defaultEditorOperationRuntimeCommandLabels.redo,
        run: (context) => {
          context.setEditor(redoEditorOperationRuntime);
        },
      },
    ],
    options,
    {
      disabled: options.disabled,
      hotkeys: options.hotkeys,
      labels: options.labels,
    },
  );
}
