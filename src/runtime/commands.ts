import type { EditorCommandDefinition, EditorHotkeyMap } from "../hotkeys.js";
import {
  markEditorRuntimeSaved,
  redoEditorRuntime,
  resetEditorRuntime,
  undoEditorRuntime,
} from "./state.js";
import type { EditorRuntimeState } from "./types.js";

export type EditorRuntimeCommandId = "undo" | "redo" | "reset" | "save";

export type EditorDocumentIoCommandId = "save" | "import" | "export";

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

export const defaultEditorDocumentIoCommandHotkeys: EditorHotkeyMap<EditorDocumentIoCommandId> = {
  export: ["Mod+Shift+S"],
  import: ["Mod+O"],
  save: ["Mod+Alt+S"],
};

export const defaultEditorDocumentIoCommandLabels: Record<EditorDocumentIoCommandId, string> = {
  export: "Export JSON",
  import: "Import JSON",
  save: "Save",
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

export type EditorDocumentIoCommandsOptions<TDocument, TSelection = unknown> = {
  runtime: EditorRuntimeState<TDocument, TSelection>;
  save?: {
    run: (runtime: EditorRuntimeState<TDocument, TSelection>) => void | Promise<void>;
    disabled?: boolean;
  };
  import?: {
    run: () => void | Promise<void>;
    disabled?: boolean;
  };
  export?: {
    run: (runtime: EditorRuntimeState<TDocument, TSelection>) => void | Promise<void>;
    disabled?: boolean;
  };
  hotkeys?: Partial<EditorHotkeyMap<EditorDocumentIoCommandId>>;
  labels?: Partial<Record<EditorDocumentIoCommandId, string>>;
  include?: readonly EditorDocumentIoCommandId[];
};

const defaultEditorRuntimeCommandOrder: readonly EditorRuntimeCommandId[] = [
  "undo",
  "redo",
  "reset",
  "save",
];

const defaultEditorDocumentIoCommandOrder: readonly EditorDocumentIoCommandId[] = [
  "save",
  "import",
  "export",
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

export function createEditorDocumentIoCommands<TDocument, TSelection = unknown>(
  options: EditorDocumentIoCommandsOptions<TDocument, TSelection>,
): readonly EditorCommandDefinition<EditorDocumentIoCommandId>[] {
  const include = options.include ?? defaultEditorDocumentIoCommandOrder;

  return include.map((id) => {
    const disabled = isEditorDocumentIoCommandDisabled(id, options);

    return {
      disabled,
      hotkeys: options.hotkeys?.[id] ?? defaultEditorDocumentIoCommandHotkeys[id],
      id,
      label: options.labels?.[id] ?? defaultEditorDocumentIoCommandLabels[id],
      run: async () => {
        if (disabled) {
          return;
        }

        if (id === "import") {
          await options.import?.run();
          return;
        }

        if (id === "export") {
          await options.export?.run(options.runtime);
          return;
        }

        await options.save?.run(options.runtime);
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

function isEditorDocumentIoCommandDisabled<TDocument, TSelection>(
  id: EditorDocumentIoCommandId,
  options: EditorDocumentIoCommandsOptions<TDocument, TSelection>,
): boolean {
  if (id === "save") {
    return options.save?.disabled ?? options.runtime.status === "clean";
  }

  if (id === "import") {
    return options.import?.disabled === true;
  }

  return options.export?.disabled === true;
}
