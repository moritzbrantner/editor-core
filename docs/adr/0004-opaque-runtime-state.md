# Opaque functional runtime state

Runtime and Operation Runtime state are opaque, readonly values created by their factories and
returned by their transitions. They remain functional values rather than becoming stateful
handles.

## Context

Runtime behavior depends on validation, aspect, history equality, operation preflight, transaction
merging, and history-limit policy stored in module-local weak metadata. The former structural state
types did not expose that ownership invariant. Copying Runtime state already failed when a
transition tried to recover its metadata, while copying Operation Runtime state silently fell back
to empty policy.

## Considered Options

- Keep structural state types and document the runtime restriction.
- Bind transitions to a retained policy definition.
- Replace functional state with a stateful Runtime handle.
- Keep the functional interface and make state nominally opaque.

## Decision

Runtime and Operation Runtime use separate, non-exported nominal identities at the type level and
module-local weak metadata at runtime. Their factories and transitions are the only supported
construction paths. Runtime-owned fields, history stacks, operation stacks, transition contexts,
and aspect maps are readonly.

Generic documents, selections, origins, operation metadata, caller-provided issues, and derived
aspect values remain caller-owned. Runtime does not recursively freeze them, and no runtime object
freezing is introduced.

## Consequences

Valid factory-and-transition usage keeps the same calling pattern. Manual construction, object
spread copies, and deserialization of Runtime state are intentionally unsupported and fail during
type checking; forged JavaScript values fail at the first transition. Persistence continues to
store documents and rebuild Runtime state through existing transitions.

Ownership metadata is local to one installed module instance, so a state value cannot be passed to
transitions from another copy of the package.
