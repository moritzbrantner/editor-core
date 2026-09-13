# Editor family conformance

`@moenarch/editor-core/conformance` provides a domain-neutral harness for checking the behavioral invariants shared by specialized editors without defining their document ontology.

A consumer supplies its own document factory, action sequence, and transition function. Optional adapters add normalization, history, serialization, migration, and persistence checks. The harness verifies that repeated action application is deterministic, transitions do not mutate the original document, normalization is idempotent, complete undo/redo traversals restore the initial and final documents, serialization or persistence roundtrips preserve the document, and named migration cases produce their expected semantic documents.

History adapters can also expose `getSelection`. When they do, the harness fingerprints the initial and final selections and verifies that complete undo and redo traversals restore those states together with the document. JSON-compatible selections use the stable JSON fingerprint by default; adapters with another semantic representation can provide `selectionFingerprint` without moving selection policy into editor-core.

Normalization remains consumer-owned: the harness only requires that normalizing an already normalized document does not change the semantic result. Migration cases likewise keep versioning and envelope policy in the specialized editor; each case supplies serialized legacy input, the expected current document, and the consumer-owned migrate/parse functions needed to prove that boundary.

Graph, workflow, timeline, layer, and later editor packages should run this harness against public package APIs. Domain rules remain in those downstream packages; the conformance layer only checks generic mechanics.

Source-mode and packed-consumer compatibility remain repository/distribution concerns. They should continue to be enforced by each repository's deterministic validation contract alongside this semantic conformance suite rather than being represented as runtime editor APIs.
