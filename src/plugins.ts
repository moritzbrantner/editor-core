import type { EditorAspectDefinition } from "./aspects.js";
import {
  getEditorCommandDiagnostics,
  resolveEditorCommands,
  type EditorCommandContext,
  type EditorCommandDiagnostic,
  type EditorContextualCommandDefinition,
  type EditorResolvedCommandDefinition,
} from "./commands.js";
import type { EditorCommandDefinition } from "./hotkeys.js";
import type {
  EditorOperationPreflightContext,
  EditorOperationPreflightIssue,
} from "./operations.js";
import type {
  EditorRuntimeOptions,
  EditorRuntimeValidationIssue,
  EditorRuntimeValidator,
} from "./runtime.js";

export type EditorPlugin<TDocument = unknown, TSelection = unknown> = {
  id: string;
  label?: string;
  commands?: readonly EditorContextualCommandDefinition<string, TDocument, TSelection>[];
  validators?: readonly EditorRuntimeValidator<TDocument>[];
  aspects?: readonly EditorAspectDefinition<TDocument, unknown>[];
  operationPreflight?: readonly ((
    context: EditorOperationPreflightContext<TDocument, TSelection>,
  ) => readonly EditorOperationPreflightIssue[])[];
  metadata?: Record<string, unknown>;
};

export type EditorPluginRegistry<TDocument, TSelection> = {
  plugins: readonly EditorPlugin<TDocument, TSelection>[];
  commands: readonly EditorContextualCommandDefinition<string, TDocument, TSelection>[];
  validators: readonly EditorRuntimeValidator<TDocument>[];
  aspects: readonly EditorAspectDefinition<TDocument, unknown>[];
};

export type EditorPluginDiagnostic = {
  pluginId: string;
  path: string;
  message: string;
  severity: "error" | "warning";
};

export function createEditorPluginRegistry<TDocument, TSelection>(
  plugins: readonly EditorPlugin<TDocument, TSelection>[],
): EditorPluginRegistry<TDocument, TSelection> {
  return {
    aspects: plugins.flatMap((plugin) => plugin.aspects ?? []),
    commands: plugins.flatMap((plugin) => plugin.commands ?? []),
    plugins: [...plugins],
    validators: plugins.flatMap((plugin) => plugin.validators ?? []),
  };
}

export function getEditorPluginDiagnostics<TDocument, TSelection>(
  registry: EditorPluginRegistry<TDocument, TSelection>,
): readonly (EditorPluginDiagnostic | EditorCommandDiagnostic<string>)[] {
  const diagnostics: (EditorPluginDiagnostic | EditorCommandDiagnostic<string>)[] = [];
  const pluginIndexesById = new Map<string, number[]>();
  const aspectIndexesById = new Map<string, number[]>();

  registry.plugins.forEach((plugin, index) => {
    pluginIndexesById.set(plugin.id, [...(pluginIndexesById.get(plugin.id) ?? []), index]);
  });

  for (const [pluginId, indexes] of pluginIndexesById) {
    for (const index of indexes.slice(1)) {
      diagnostics.push({
        message: `Duplicate plugin id "${pluginId}".`,
        path: `${index}.id`,
        pluginId,
        severity: "error",
      });
    }
  }

  registry.aspects.forEach((aspect, index) => {
    aspectIndexesById.set(aspect.id, [...(aspectIndexesById.get(aspect.id) ?? []), index]);
  });

  for (const [aspectId, indexes] of aspectIndexesById) {
    for (const index of indexes.slice(1)) {
      diagnostics.push({
        message: `Duplicate aspect id "${aspectId}".`,
        path: `aspects.${index}.id`,
        pluginId: findEditorPluginIdForAspect(registry.plugins, aspectId) ?? "",
        severity: "error",
      });
    }
  }

  diagnostics.push(
    ...getEditorCommandDiagnostics(toEditorPluginDiagnosticCommands(registry.commands)),
  );
  return diagnostics;
}

export function resolveEditorPluginRuntimeOptions<TDocument, TSelection>(
  registry: EditorPluginRegistry<TDocument, TSelection>,
  baseOptions: EditorRuntimeOptions<TDocument, TSelection>,
): EditorRuntimeOptions<TDocument, TSelection> & {
  preflight: (
    context: EditorOperationPreflightContext<TDocument, TSelection>,
  ) => readonly EditorOperationPreflightIssue[];
} {
  const preflight = registry.plugins.flatMap((plugin) => plugin.operationPreflight ?? []);

  return {
    ...baseOptions,
    aspects: [...(baseOptions.aspects ?? []), ...registry.aspects],
    validate: composeEditorPluginValidators(baseOptions.validate, registry.validators),
    preflight(context) {
      return preflight.flatMap((validateOperation) => validateOperation(context));
    },
  };
}

export function resolveEditorPluginCommands<TDocument, TSelection>(
  registry: EditorPluginRegistry<TDocument, TSelection>,
  context: EditorCommandContext<TDocument, TSelection>,
): readonly EditorResolvedCommandDefinition<string>[] {
  return resolveEditorCommands(registry.commands, context);
}

function composeEditorPluginValidators<TDocument>(
  baseValidator: EditorRuntimeValidator<TDocument> | undefined,
  validators: readonly EditorRuntimeValidator<TDocument>[],
): EditorRuntimeValidator<TDocument> {
  return (document) => {
    const issues: EditorRuntimeValidationIssue[] = [];
    issues.push(...(baseValidator?.(document) ?? []));
    for (const validator of validators) {
      issues.push(...validator(document));
    }
    return issues;
  };
}

function findEditorPluginIdForAspect<TDocument, TSelection>(
  plugins: readonly EditorPlugin<TDocument, TSelection>[],
  aspectId: string,
): string | null {
  return (
    plugins.find((plugin) => plugin.aspects?.some((aspect) => aspect.id === aspectId))?.id ?? null
  );
}

function toEditorPluginDiagnosticCommands<TDocument, TSelection>(
  commands: readonly EditorContextualCommandDefinition<string, TDocument, TSelection>[],
): readonly EditorCommandDefinition<string>[] {
  return commands.map((command) => ({
    hotkeys: command.hotkeys,
    id: command.id,
    label: command.label,
  }));
}
