import {
  getEditorHotkeyConflicts,
  isEditorHotkeyValid,
  type EditorCommandDefinition,
  type EditorHotkeyMap,
} from "../hotkeys.js";

export type EditorCommandDiagnostic<TId extends string = string> = {
  commandId: TId;
  path: string;
  message: string;
  severity: "error" | "warning";
};

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
