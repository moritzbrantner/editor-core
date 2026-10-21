import {
  isEditorEditableTarget,
  matchesEditorHotkey,
  type EditorCommandDefinition,
  type EditorHotkeyEvent,
} from "../hotkeys.js";
import {
  getEditorTelemetryErrorName,
  type EditorTelemetry,
  type EditorTelemetryEventMap,
} from "../telemetry.js";
import { getEditorCommandDiagnostics, type EditorCommandDiagnostic } from "./diagnostics.js";

export type EditorCommandRuntimeEvent = EditorHotkeyEvent & {
  preventDefault?: () => void;
};

export type EditorCommandRuntimeOptions<TId extends string> = {
  commands: readonly EditorCommandDefinition<TId>[];
  disabled?: boolean;
  readOnly?: boolean;
  allowEditableTargets?: boolean;
  isInScope?: (event: EditorHotkeyEvent) => boolean;
  /** Opt-in telemetry for command outcomes. */
  telemetry?: EditorTelemetry;
};

export type EditorCommandRuntimeMatch<TId extends string> = {
  command: EditorCommandDefinition<TId>;
  commandId: TId;
  hotkey: string;
};

export type EditorCommandRuntimeIgnoredReason =
  | "runtime-disabled"
  | "read-only"
  | "out-of-scope"
  | "editable-target"
  | "no-match"
  | "missing-run";

export type EditorCommandRuntimeRunResult<TId extends string> =
  | {
      status: "ignored";
      reason: EditorCommandRuntimeIgnoredReason;
      commandId?: TId;
    }
  | {
      status: "ran";
      command: EditorCommandDefinition<TId>;
      commandId: TId;
      hotkey: string;
    };

export type EditorCommandRuntime<TId extends string> = {
  commands: readonly EditorCommandDefinition<TId>[];
  resolve(event: EditorHotkeyEvent): EditorCommandRuntimeMatch<TId> | null;
  run(event: EditorCommandRuntimeEvent): Promise<EditorCommandRuntimeRunResult<TId>>;
  diagnostics(): readonly EditorCommandDiagnostic<TId>[];
};

export function createEditorCommandRuntime<TId extends string>(
  options: EditorCommandRuntimeOptions<TId>,
): EditorCommandRuntime<TId> {
  const resolve = (event: EditorHotkeyEvent): EditorCommandRuntimeMatch<TId> | null => {
    if (getRuntimeIgnoredReason(options, event)) {
      return null;
    }

    for (const command of options.commands) {
      if (command.disabled) {
        continue;
      }

      const hotkey = command.hotkeys?.find((candidate) => matchesEditorHotkey(event, candidate));
      if (hotkey) {
        return {
          command,
          commandId: command.id,
          hotkey,
        };
      }
    }

    return null;
  };

  return {
    commands: options.commands,
    diagnostics() {
      return getEditorCommandDiagnostics(options.commands);
    },
    resolve,
    async run(event) {
      const { telemetry } = options;
      if (!telemetry) {
        return runEditorCommand(event);
      }
      const startedAt = telemetry.now();
      const report = (attributes: EditorTelemetryEventMap["command.run"]) =>
        telemetry.emit("command.run", attributes, { durationMs: telemetry.now() - startedAt });
      let result: EditorCommandRuntimeRunResult<TId>;
      try {
        result = await runEditorCommand(event);
      } catch (error) {
        report({
          commandId: resolve(event)?.commandId,
          errorName: getEditorTelemetryErrorName(error),
          status: "failed",
        });
        throw error;
      }
      if (result.status === "ignored" && result.reason === "no-match") {
        return result;
      }
      report(
        result.status === "ran"
          ? { commandId: result.commandId, status: "ran" }
          : { commandId: result.commandId, reason: result.reason, status: "ignored" },
      );
      return result;
    },
  };

  async function runEditorCommand(
    event: EditorCommandRuntimeEvent,
  ): Promise<EditorCommandRuntimeRunResult<TId>> {
    const ignoredReason = getRuntimeIgnoredReason(options, event);
    if (ignoredReason) {
      return {
        reason: ignoredReason,
        status: "ignored",
      };
    }

    const match = resolve(event);
    if (!match) {
      return {
        reason: "no-match",
        status: "ignored",
      };
    }

    if (!match.command.run) {
      return {
        commandId: match.commandId,
        reason: "missing-run",
        status: "ignored",
      };
    }

    event.preventDefault?.();
    await match.command.run(event);
    return {
      command: match.command,
      commandId: match.commandId,
      hotkey: match.hotkey,
      status: "ran",
    };
  }
}

function getRuntimeIgnoredReason<TId extends string>(
  options: EditorCommandRuntimeOptions<TId>,
  event: EditorHotkeyEvent,
): Exclude<EditorCommandRuntimeIgnoredReason, "missing-run" | "no-match"> | null {
  if (options.disabled) {
    return "runtime-disabled";
  }

  if (options.readOnly) {
    return "read-only";
  }

  if (options.isInScope?.(event) === false) {
    return "out-of-scope";
  }

  if (options.allowEditableTargets !== true && isEditorEditableTarget(event.target)) {
    return "editable-target";
  }

  return null;
}
