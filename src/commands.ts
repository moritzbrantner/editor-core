import {
  redoEditorSnapshotHistory,
  resetEditorSnapshotHistory,
  undoEditorSnapshotHistory,
  type EditorSnapshotHistory,
  type EditorSnapshotHistoryOptions,
} from "./history.js";
import {
  type EditorCommandDefinition,
  type EditorHotkeyEvent,
  type EditorHotkeyMap,
} from "./hotkeys.js";
import { createEditorCommands } from "./commands/factory.js";
export * from "./commands/diagnostics.js";
export * from "./commands/factory.js";
export * from "./commands/runtime.js";

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
  return createEditorCommands(
    [
      {
        disabled: (context) => !context.history.canUndo,
        hotkeys: defaultEditorSnapshotHistoryCommandHotkeys.undo,
        id: "undo",
        label: defaultEditorSnapshotHistoryCommandLabels.undo,
        run: async (context, event) => {
          context.setHistory(undoEditorSnapshotHistory);
          await context.onRun?.({ event, id: "undo" });
        },
      },
      {
        disabled: (context) => !context.history.canRedo,
        hotkeys: defaultEditorSnapshotHistoryCommandHotkeys.redo,
        id: "redo",
        label: defaultEditorSnapshotHistoryCommandLabels.redo,
        run: async (context, event) => {
          context.setHistory(redoEditorSnapshotHistory);
          await context.onRun?.({ event, id: "redo" });
        },
      },
      {
        hotkeys: defaultEditorSnapshotHistoryCommandHotkeys.reset,
        id: "reset",
        label: defaultEditorSnapshotHistoryCommandLabels.reset,
        run: async (context, event) => {
          context.setHistory(() =>
            resetEditorSnapshotHistory(context.getResetDocument(), context.historyOptions),
          );
          await context.onRun?.({ event, id: "reset" });
        },
      },
    ],
    options,
    {
      disabled: options.disabled,
      hotkeys: options.hotkeys,
      include: options.include ?? defaultEditorSnapshotHistoryCommandOrder,
      labels: options.labels,
    },
  );
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
