# Command runtime

Command execution policy lives in the commands module, not in React hooks or plugin adapters.
Hotkey parsing and matching remain low-level hotkey behavior, while command runtime behavior decides
whether a command may run, which command matches an event, whether default browser behavior should
be prevented, and how command diagnostics are exposed.

## Considered Options

- Keep command matching and editable-target policy inside React hooks.
- Add a new package subpath for command runtime behavior.
- Expose an additive command runtime from the existing commands subpath.

## Consequences

The commands subpath owns shared command resolution, execution guards, and diagnostics. React hooks
delegate to the same runtime policy as headless callers, including read-only suppression and
editable-target handling. The hotkeys subpath remains compatible as the low-level shortcut parsing,
formatting, and matching module.
