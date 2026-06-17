import * as React from "react";
import { createEditorCommandRuntime, type EditorCommandRuntimeEvent } from "../commands.js";
import { type EditorCommandDefinition, type EditorHotkeyEvent } from "../hotkeys.js";

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
    if (typeof document === "undefined") {
      return;
    }

    const scope = scopeRef?.current ?? null;
    const runtime = createEditorCommandRuntime({
      allowEditableTargets,
      commands,
      disabled,
      readOnly,
      ...(scope
        ? {
            isInScope: (event) => isEditorHotkeyInScope(scope, event),
          }
        : {}),
    });
    const onKeyDown = (event: KeyboardEvent) => {
      void runtime.run(event as EditorCommandRuntimeEvent);
    };

    document.addEventListener("keydown", onKeyDown as EventListener);
    return () => document.removeEventListener("keydown", onKeyDown as EventListener);
  }, [allowEditableTargets, commands, disabled, readOnly, scopeRef]);
}

function isEditorHotkeyInScope(scope: HTMLElement, event: EditorHotkeyEvent): boolean {
  const target = event.target;
  if (target instanceof Node && scope.contains(target)) {
    return true;
  }

  const activeElement = document.activeElement;
  return activeElement === document.body || Boolean(activeElement && scope.contains(activeElement));
}
