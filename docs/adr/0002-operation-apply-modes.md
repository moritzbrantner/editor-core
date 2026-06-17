# Operation apply modes

Operation apply behavior belongs in the operations module, not in interaction or sync adapters.
Local edits, interaction commits, and remote apply all start from the same semantic operation shape,
but they differ in transaction merging and undo-history ownership.

## Considered Options

- Keep passing low-level merge options from interaction and sync.
- Let sync repair operation runtime state after remote apply.
- Expose named operation apply modes from the operations subpath.

## Consequences

The operations subpath owns the public mode-specific helpers for interaction and remote apply.
Interaction no longer knows about merge options, and sync no longer mutates operation runtime state
to preserve local undo history. Remote preflight errors still surface through sync failures, while
remote warnings remain non-blocking.
