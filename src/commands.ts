import {
  redoEditorSnapshotHistory,
  resetEditorSnapshotHistory,
  undoEditorSnapshotHistory,
  type EditorSnapshotHistory,
  type EditorSnapshotHistoryOptions,
} from "./history.js";
import {
  getEditorHotkeyConflicts,
  isEditorHotkeyValid,
  type EditorCommandDefinition,
  type EditorHotkeyEvent,
  type EditorHotkeyMap,
} from "./hotkeys.js";

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

export type EditorCommandDiagnostic<TId extends string = string> = {
  commandId: TId;
  path: string;
  message: string;
  severity: "error" | "warning";
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

export function getEditorCommandDiagnostics<TId extends string>(
  commands: readonly EditorCommandDefinition<TId>[],
): readonly EditorCommandDiagnostic<TId>[] {
  const diagnostics: EditorCommandDiagnostic<TId>[] = [];
  const commandIndexesById = new Map<TId, number[]>();

  commands.forEach((command, index) => {
    commandIndexesById.set(command.id, [...(commandIndexesById.get(command.id) ?? []), index]);

    if (command.label.trim().length === 0) {
      diagnostics.push({
        commandId: command.id,
        message: "Command labels should not be empty.",
        path: `${index}.label`,
        severity: "warning",
      });
    }

    for (const [hotkeyIndex, hotkey] of (command.hotkeys ?? []).entries()) {
      if (!isEditorHotkeyValid(hotkey)) {
        diagnostics.push({
          commandId: command.id,
          message: `Invalid hotkey "${hotkey}".`,
          path: `${index}.hotkeys.${hotkeyIndex}`,
          severity: "error",
        });
      }
    }
  });

  for (const [commandId, indexes] of commandIndexesById) {
    if (indexes.length <= 1) {
      continue;
    }

    for (const index of indexes.slice(1)) {
      diagnostics.push({
        commandId,
        message: `Duplicate command id "${commandId}".`,
        path: `${index}.id`,
        severity: "error",
      });
    }
  }

  const enabledCommands = commands.filter((command) => !command.disabled);
  const hotkeysByCommand = Object.fromEntries(
    enabledCommands.map((command) => [command.id, command.hotkeys ?? []]),
  ) as EditorHotkeyMap<TId>;
  const reportedConflicts = new Set<string>();

  commands.forEach((command, index) => {
    if (command.disabled) {
      return;
    }

    for (const [hotkeyIndex, hotkey] of (command.hotkeys ?? []).entries()) {
      const conflicts = getEditorHotkeyConflicts(command.id, hotkey, hotkeysByCommand, commands);
      for (const conflictingCommandId of conflicts) {
        const conflictKey = [command.id, conflictingCommandId].sort().join("\0");
        if (reportedConflicts.has(`${conflictKey}\0${hotkey}`)) {
          continue;
        }
        reportedConflicts.add(`${conflictKey}\0${hotkey}`);
        diagnostics.push({
          commandId: command.id,
          message: `Hotkey "${hotkey}" conflicts with command "${conflictingCommandId}".`,
          path: `${index}.hotkeys.${hotkeyIndex}`,
          severity: "warning",
        });
      }
    }
  });

  return diagnostics;
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
