import type { EditorCommandDefinition, EditorHotkeyEvent, EditorHotkeyMap } from "../hotkeys.js";

export type EditorCommandFactoryDefinition<TId extends string, TContext> = {
  id: TId;
  label: string;
  hotkeys?: readonly string[];
  disabled?: (context: TContext) => boolean;
  run?: (context: TContext, event: EditorHotkeyEvent) => void | Promise<void>;
};

export type CreateEditorCommandsOptions<TId extends string> = {
  include?: readonly TId[];
  labels?: Partial<Record<TId, string>>;
  hotkeys?: Partial<EditorHotkeyMap<TId>>;
  disabled?: Partial<Record<TId, boolean>>;
};

export function createEditorCommands<TId extends string, TContext>(
  definitions: readonly EditorCommandFactoryDefinition<TId, TContext>[],
  context: TContext,
  options: CreateEditorCommandsOptions<TId> = {},
): readonly EditorCommandDefinition<TId>[] {
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  const include = options.include ?? definitions.map((definition) => definition.id);

  return include.map((id) => {
    const definition = definitionsById.get(id);
    if (!definition) {
      throw new Error(`Unknown editor command id "${id}".`);
    }

    const disabled = hasCommandOverride(options.disabled, id)
      ? options.disabled[id] === true
      : definition.disabled?.(context) === true;

    return {
      disabled,
      hotkeys: options.hotkeys?.[id] ?? definition.hotkeys,
      id,
      label: options.labels?.[id] ?? definition.label,
      run: async (event) => {
        if (disabled) {
          return;
        }

        await definition.run?.(context, event);
      },
    };
  });
}

function hasCommandOverride<TId extends string>(
  overrides: Partial<Record<TId, boolean>> | undefined,
  id: TId,
): overrides is Partial<Record<TId, boolean>> {
  return overrides ? Object.hasOwn(overrides, id) : false;
}
