import { createEditorCommands } from "../commands.js";
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
  return createEditorCommands(
    [
      {
        disabled: (context) => !context.runtime.canUndo,
        hotkeys: defaultEditorRuntimeCommandHotkeys.undo,
        id: "undo",
        label: defaultEditorRuntimeCommandLabels.undo,
        run: (context) => {
          context.setRuntime(undoEditorRuntime);
        },
      },
      {
        disabled: (context) => !context.runtime.canRedo,
        hotkeys: defaultEditorRuntimeCommandHotkeys.redo,
        id: "redo",
        label: defaultEditorRuntimeCommandLabels.redo,
        run: (context) => {
          context.setRuntime(redoEditorRuntime);
        },
      },
      {
        hotkeys: defaultEditorRuntimeCommandHotkeys.reset,
        id: "reset",
        label: defaultEditorRuntimeCommandLabels.reset,
        run: (context) => {
          context.setRuntime((runtime) =>
            resetEditorRuntime(runtime, context.getResetDocument(), { markSaved: true }),
          );
        },
      },
      {
        disabled: (context) => context.runtime.status === "clean",
        hotkeys: defaultEditorRuntimeCommandHotkeys.save,
        id: "save",
        label: defaultEditorRuntimeCommandLabels.save,
        run: async (context) => {
          if (context.onSave) {
            await context.onSave(context.runtime);
          }
          context.setRuntime(markEditorRuntimeSaved);
        },
      },
    ],
    options,
    {
      disabled: options.disabled,
      hotkeys: options.hotkeys,
      include: options.include ?? defaultEditorRuntimeCommandOrder,
      labels: options.labels,
    },
  );
}

export function createEditorDocumentIoCommands<TDocument, TSelection = unknown>(
  options: EditorDocumentIoCommandsOptions<TDocument, TSelection>,
): readonly EditorCommandDefinition<EditorDocumentIoCommandId>[] {
  return createEditorCommands(
    [
      {
        disabled: (context) => context.save?.disabled ?? context.runtime.status === "clean",
        hotkeys: defaultEditorDocumentIoCommandHotkeys.save,
        id: "save",
        label: defaultEditorDocumentIoCommandLabels.save,
        run: async (context) => {
          await context.save?.run(context.runtime);
        },
      },
      {
        disabled: (context) => context.import?.disabled === true,
        hotkeys: defaultEditorDocumentIoCommandHotkeys.import,
        id: "import",
        label: defaultEditorDocumentIoCommandLabels.import,
        run: async (context) => {
          await context.import?.run();
        },
      },
      {
        disabled: (context) => context.export?.disabled === true,
        hotkeys: defaultEditorDocumentIoCommandHotkeys.export,
        id: "export",
        label: defaultEditorDocumentIoCommandLabels.export,
        run: async (context) => {
          await context.export?.run(context.runtime);
        },
      },
    ],
    options,
    {
      hotkeys: options.hotkeys,
      include: options.include ?? defaultEditorDocumentIoCommandOrder,
      labels: options.labels,
    },
  );
}
