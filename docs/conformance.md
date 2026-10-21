# Editor family conformance

`@moenarch/editor-core/conformance` provides a domain-neutral harness for checking the behavioral invariants shared by specialized editors without defining their document ontology.

A consumer supplies its own document factory, action sequence, and transition function. Optional adapters add normalization, history, serialization, migration, persistence, and invalid-import checks. The harness verifies that repeated action application is deterministic, transitions do not mutate the original document, normalization is idempotent, complete undo/redo traversals restore the initial and final documents, serialization or persistence roundtrips preserve the document, named migration cases produce their expected semantic documents, and rejected imports leave editor state unchanged while returning structured diagnostics.

Serialization and persistence adapters can register named `cases` in addition to the action-produced document. These cases let specialized editors pin opaque JSON-compatible custom fields, plugin metadata, or other semantic edge cases that must survive a roundtrip. A failure reports the case name while leaving the meaning and schema of that data entirely downstream-owned.

Invalid-import adapters register malformed or unsupported inputs and map the specialized editor's native parser/import behavior into `{ document, diagnostics }`. The harness requires at least one structured `{ message, path? }` diagnostic, verifies that the returned document is semantically unchanged, and separately checks that the original document was not mutated in place. Parsing format, validation rules, migration policy, and diagnostic wording remain consumer-owned.

History adapters can also expose `getSelection`. When they do, the harness fingerprints the initial and final selections and verifies that complete undo and redo traversals restore those states together with the document. JSON-compatible selections use the stable JSON fingerprint by default; adapters with another semantic representation can provide `selectionFingerprint` without moving selection policy into editor-core.

Normalization remains consumer-owned: the harness only requires that normalizing an already normalized document does not change the semantic result. Migration cases likewise keep versioning and envelope policy in the specialized editor; each case supplies serialized legacy input, the expected current document, and the consumer-owned migrate/parse functions needed to prove that boundary.

Three optional adapters cover editor behavior beyond the document transition:

- **`readOnly`**: `execute(document, action)` runs the consumer's registered commands while the editor is read-only. Every suite action must leave the document semantically unchanged and unmutated.
- **`dirtyState`**: wraps the consumer's dirty/saved state with `create`, `apply`, `markSaved`, `isDirty` and `getDocument`. A new state is clean. A suite action that edits the document semantically must leave the state dirty, and an action without a semantic edit, such as a selection change, must not change the flag. `markSaved` clears it.
- **`interactions.cancelled`**: names drag, resize or other interactions that start and are cancelled on top of the history produced by the suite actions. This needs `history`. A cancelled interaction must leave the document unchanged and must not enter history: undo still reverts the last suite action.

Graph, workflow, timeline, layer, and later editor packages should run this harness against public package APIs. Domain rules remain in those downstream packages; the conformance layer only checks generic mechanics.

Source-mode and packed-consumer compatibility remain repository/distribution concerns. They should continue to be enforced by each repository's deterministic validation contract alongside this semantic conformance suite rather than being represented as runtime editor APIs. In this repository, `bun run smoke:package` installs the packed tarball into a clean consumer and runs a reference suite exercising every capability through `@moenarch/editor-core/conformance`.
