import * as React from "react";
import {
  getEditorCommandIdFromKeyboardEvent,
  isEditorEditableTarget,
  matchesEditorHotkey,
  type EditorCommandDefinition,
  type EditorHotkeyEvent,
} from "../hotkeys.js";

export type UseEditorHotkeysOptions<TId extends string> = {
  commands: readonly EditorCommandDefinition<TId>[];
  disabled?: boolean;
  readOnly?: boolean;
  allowEditableTargets?: boolean;
  scopeRef?: React.RefObject<HTMLElement | null>;
};

export function useEditorHotkeys<TId extends string>({
  commands,
  disabled = false,
  readOnly = false,
  allowEditableTargets = false,
  scopeRef,
}: UseEditorHotkeysOptions<TId>): void {
  React.useEffect(() => {
    if (disabled || typeof document === "undefined") {
      return;
    }

    const scope = scopeRef?.current ?? null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (scope && !isEditorHotkeyInScope(scope, event)) {
        return;
      }

      if (!allowEditableTargets && isEditorEditableTarget(event.target)) {
        return;
      }

      const commandId = allowEditableTargets
        ? (commands.find(
            (command) =>
              !command.disabled &&
              command.hotkeys?.some((hotkey) => matchesEditorHotkey(event, hotkey)),
          )?.id ?? null)
        : getEditorCommandIdFromKeyboardEvent(event as EditorHotkeyEvent, commands);
      const command = commands.find((candidate) => candidate.id === commandId);
      if (!command?.run) {
        return;
      }

      event.preventDefault();
      void command.run(event as EditorHotkeyEvent);
    };

    document.addEventListener("keydown", onKeyDown as EventListener);
    return () => document.removeEventListener("keydown", onKeyDown as EventListener);
  }, [allowEditableTargets, commands, disabled, readOnly, scopeRef]);
}

function isEditorHotkeyInScope(scope: HTMLElement, event: KeyboardEvent): boolean {
  const target = event.target;
  if (target instanceof Node && scope.contains(target)) {
    return true;
  }

  const activeElement = document.activeElement;
  return activeElement === document.body || Boolean(activeElement && scope.contains(activeElement));
}
