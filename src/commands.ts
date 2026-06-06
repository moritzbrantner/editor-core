import {
  redoEditorSnapshotHistory,
  resetEditorSnapshotHistory,
  undoEditorSnapshotHistory,
  type EditorSnapshotHistory,
  type EditorSnapshotHistoryOptions,
} from "./history.js";
import type { EditorCommandDefinition, EditorHotkeyEvent, EditorHotkeyMap } from "./hotkeys.js";

export type EditorSnapshotHistoryCommandId = "undo" | "redo" | "reset";

export type EditorCommandContext<TDocument, TSelection, TViewport = unknown> = {
  document: TDocument;
  selection: TSelection;
  viewport?: TViewport;
  readOnly?: boolean;
};

export type EditorContextualCommandDefinition<
  TId extends string,
  TDocument,
  TSelection,
  TViewport = unknown,
> = Omit<EditorCommandDefinition<TId>, "disabled" | "run"> & {
  group?: string;
  menu?: {
    label?: string;
    order?: number;
  };
  canRun?: (context: EditorCommandContext<TDocument, TSelection, TViewport>) => boolean;
  checked?:
    | boolean
    | ((context: EditorCommandContext<TDocument, TSelection, TViewport>) => boolean);
  run?: (context: EditorCommandContext<TDocument, TSelection, TViewport>) => void | Promise<void>;
};

export type EditorResolvedCommandDefinition<TId extends string> = EditorCommandDefinition<TId> & {
  group?: string;
  menu?: {
    label?: string;
    order?: number;
  };
  checked?: boolean;
};

export const defaultEditorSnapshotHistoryCommandHotkeys: EditorHotkeyMap<EditorSnapshotHistoryCommandId> =
  {
    undo: ["Mod+Z"],
    redo: ["Mod+Shift+Z"],
    reset: ["Mod+Backspace"],
  };

export const defaultEditorSnapshotHistoryCommandLabels: Record<
  EditorSnapshotHistoryCommandId,
  string
> = {
  undo: "Undo",
  redo: "Redo",
  reset: "Reset",
};

export type EditorSnapshotHistoryCommandRunContext = {
  id: EditorSnapshotHistoryCommandId;
  event: EditorHotkeyEvent;
};

export type EditorSnapshotHistoryCommandsOptions<TDocument> = {
  history: EditorSnapshotHistory<TDocument>;
  setHistory: (
    updater: (history: EditorSnapshotHistory<TDocument>) => EditorSnapshotHistory<TDocument>,
  ) => void;
  getResetDocument: () => TDocument;
  historyOptions?: EditorSnapshotHistoryOptions<TDocument>;
  hotkeys?: Partial<EditorHotkeyMap<EditorSnapshotHistoryCommandId>>;
  labels?: Partial<Record<EditorSnapshotHistoryCommandId, string>>;
  disabled?: Partial<Record<EditorSnapshotHistoryCommandId, boolean>>;
  include?: readonly EditorSnapshotHistoryCommandId[];
  onRun?: (context: EditorSnapshotHistoryCommandRunContext) => void | Promise<void>;
};

const defaultEditorSnapshotHistoryCommandOrder: readonly EditorSnapshotHistoryCommandId[] = [
  "undo",
  "redo",
  "reset",
];

export function createEditorSnapshotHistoryCommands<TDocument>(
  options: EditorSnapshotHistoryCommandsOptions<TDocument>,
): readonly EditorCommandDefinition<EditorSnapshotHistoryCommandId>[] {
  const include = options.include ?? defaultEditorSnapshotHistoryCommandOrder;

  return include.map((id) => {
    const disabled = isEditorSnapshotHistoryCommandDisabled(id, options);

    return {
      disabled,
      hotkeys: options.hotkeys?.[id] ?? defaultEditorSnapshotHistoryCommandHotkeys[id],
      id,
      label: options.labels?.[id] ?? defaultEditorSnapshotHistoryCommandLabels[id],
      run: (event) => {
        if (disabled) {
          return;
        }

        if (id === "undo") {
          options.setHistory(undoEditorSnapshotHistory);
        } else if (id === "redo") {
          options.setHistory(redoEditorSnapshotHistory);
        } else {
          options.setHistory(() =>
            resetEditorSnapshotHistory(options.getResetDocument(), options.historyOptions),
          );
        }

        return options.onRun?.({ event, id });
      },
    };
  });
}

export function resolveEditorCommands<
  TId extends string,
  TDocument,
  TSelection,
  TViewport = unknown,
>(
  commands: readonly EditorContextualCommandDefinition<TId, TDocument, TSelection, TViewport>[],
  context: EditorCommandContext<TDocument, TSelection, TViewport>,
): readonly EditorResolvedCommandDefinition<TId>[] {
  return commands.map((command) => {
    const disabled = context.readOnly === true || command.canRun?.(context) === false;
    return {
      checked: typeof command.checked === "function" ? command.checked(context) : command.checked,
      disabled,
      group: command.group,
      hotkeys: command.hotkeys,
      id: command.id,
      label: command.label,
      menu: command.menu,
      run: async () => {
        if (!disabled) {
          await command.run?.(context);
        }
      },
    };
  });
}

export function getRunnableEditorCommands<TId extends string>(
  commands: readonly EditorResolvedCommandDefinition<TId>[],
): readonly EditorResolvedCommandDefinition<TId>[] {
  return commands.filter((command) => !command.disabled);
}

function isEditorSnapshotHistoryCommandDisabled<TDocument>(
  id: EditorSnapshotHistoryCommandId,
  options: EditorSnapshotHistoryCommandsOptions<TDocument>,
): boolean {
  if (options.disabled?.[id]) {
    return true;
  }

  if (id === "undo") {
    return !options.history.canUndo;
  }

  if (id === "redo") {
    return !options.history.canRedo;
  }

  return false;
}
