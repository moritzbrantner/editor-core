export type EditorHotkeyEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey" | "target"
>;

export type EditorHotkeyMap<TId extends string> = Record<TId, readonly string[]>;

/**
 * A command that can be rendered in UI and optionally invoked from one or more hotkeys.
 *
 * Command ids should be stable because other APIs use them for hotkey maps, conflict detection,
 * and persisted user preferences.
 */
export type EditorCommandDefinition<TId extends string> = {
  id: TId;
  label: string;
  hotkeys?: readonly string[];
  disabled?: boolean;
  run?: (event: EditorHotkeyEvent) => void | Promise<void>;
};

export type EditorParsedHotkey = {
  alt: boolean;
  ctrl: boolean;
  key: string;
  meta: boolean;
  mod: boolean;
  shift: boolean;
};

export function matchesEditorHotkey(event: EditorHotkeyEvent, hotkey: string): boolean {
  const parsed = parseEditorHotkey(hotkey);
  if (!parsed) {
    return false;
  }

  const eventKey = normalizeEditorKey(event.key);

  if (parsed.key !== eventKey) {
    return false;
  }

  const hasMod = event.metaKey || event.ctrlKey;
  if (parsed.mod) {
    return (
      hasMod &&
      event.altKey === parsed.alt &&
      event.shiftKey === parsed.shift &&
      (!parsed.ctrl || event.ctrlKey) &&
      (!parsed.meta || event.metaKey)
    );
  }

  return (
    event.altKey === parsed.alt &&
    event.ctrlKey === parsed.ctrl &&
    event.metaKey === parsed.meta &&
    event.shiftKey === parsed.shift
  );
}

export function isEditorEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "select" ||
    tagName === "textarea" ||
    target.isContentEditable ||
    Boolean(target.closest("[contenteditable='true']"))
  );
}

export function getEditorHotkeyFromKeyboardEvent(event: EditorHotkeyEvent): string {
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) {
    parts.push("Mod");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  parts.push(formatEditorShortcutPart(normalizeEditorKey(event.key)));
  return parts.join("+");
}

export function formatEditorShortcutLabel(shortcut: string): string {
  return shortcut
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(formatEditorShortcutPart)
    .join("+");
}

export function resolveEditorHotkeys<TId extends string>(
  defaults: EditorHotkeyMap<TId>,
  overrides: Partial<EditorHotkeyMap<TId>> = {},
): EditorHotkeyMap<TId> {
  return Object.fromEntries(
    Object.entries(defaults).map(([id, hotkeys]) => [
      id,
      overrides[id as TId] ?? (hotkeys as readonly string[]),
    ]),
  ) as EditorHotkeyMap<TId>;
}

export function getEditorHotkeyConflicts<TId extends string>(
  id: TId,
  hotkey: string,
  hotkeys: EditorHotkeyMap<TId>,
  definitions: readonly EditorCommandDefinition<TId>[] = [],
): TId[] {
  const canonical = canonicalEditorHotkey(hotkey);
  if (!canonical) {
    return [];
  }

  const disabledIds = new Set(
    definitions.filter((definition) => definition.disabled).map(({ id }) => id),
  );
  const conflicts: TId[] = [];

  for (const [candidateId, candidateHotkeys] of Object.entries(hotkeys) as Array<
    [TId, readonly string[]]
  >) {
    if (candidateId === id || disabledIds.has(candidateId)) {
      continue;
    }

    if (candidateHotkeys.some((candidate) => canonicalEditorHotkey(candidate) === canonical)) {
      conflicts.push(candidateId);
    }
  }

  return conflicts;
}

export function isEditorHotkeyValid(hotkey: string): boolean {
  return parseEditorHotkey(hotkey) !== null;
}

function canonicalEditorHotkey(hotkey: string): string | null {
  const parsed = parseEditorHotkey(hotkey);
  if (!parsed) {
    return null;
  }

  const modifiers = [
    parsed.mod || parsed.ctrl || parsed.meta ? "Mod" : undefined,
    parsed.alt ? "Alt" : undefined,
    parsed.shift ? "Shift" : undefined,
  ].filter(Boolean);
  return [...modifiers, formatEditorShortcutPart(parsed.key)].join("+");
}

export function parseEditorHotkey(hotkey: string): EditorParsedHotkey | null {
  const parts = hotkey
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const parsed: EditorParsedHotkey = {
    alt: false,
    ctrl: false,
    key: "",
    meta: false,
    mod: false,
    shift: false,
  };

  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (normalized === "mod") {
      parsed.mod = true;
      continue;
    }
    if (normalized === "ctrl" || normalized === "control") {
      parsed.ctrl = true;
      continue;
    }
    if (normalized === "cmd" || normalized === "command" || normalized === "meta") {
      parsed.meta = true;
      continue;
    }
    if (normalized === "alt" || normalized === "option") {
      parsed.alt = true;
      continue;
    }
    if (normalized === "shift") {
      parsed.shift = true;
      continue;
    }
    if (parsed.key) {
      return null;
    }
    parsed.key = normalizeEditorKey(part);
  }

  return parsed.key ? parsed : null;
}

function normalizeEditorKey(key: string): string {
  if (key === " ") {
    return "Space";
  }

  const normalized = key.length === 1 ? key.toLowerCase() : key;
  const aliases: Record<string, string> = {
    spacebar: "Space",
    esc: "Escape",
    del: "Delete",
    left: "ArrowLeft",
    right: "ArrowRight",
    up: "ArrowUp",
    down: "ArrowDown",
  };
  const alias = aliases[normalized.toLowerCase()];
  if (alias) {
    return alias;
  }

  if (normalized.length === 1) {
    return normalized;
  }

  const known = new Set([
    "Space",
    "Delete",
    "Backspace",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
    "Enter",
    "Escape",
    "Tab",
  ]);
  const title = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return known.has(title) ? title : normalized;
}

function formatEditorShortcutPart(part: string): string {
  const normalized = part.toLowerCase();
  const labels: Record<string, string> = {
    mod: "Mod",
    ctrl: "Ctrl",
    control: "Ctrl",
    cmd: "Meta",
    command: "Meta",
    meta: "Meta",
    alt: "Alt",
    option: "Alt",
    shift: "Shift",
    space: "Space",
    delete: "Delete",
    backspace: "Backspace",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight",
    arrowup: "ArrowUp",
    arrowdown: "ArrowDown",
    home: "Home",
    end: "End",
  };

  if (labels[normalized]) {
    return labels[normalized];
  }

  return part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1);
}
