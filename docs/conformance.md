# Editor family conformance

`@moenarch/editor-core/conformance` provides a domain-neutral harness for checking the behavioral invariants shared by specialized editors without defining their document ontology.

A consumer supplies its own document factory, action sequence, and transition function. Optional adapters add history, serialization, and persistence checks. The harness verifies that repeated action application is deterministic, transitions do not mutate the original document, complete undo/redo traversals restore the initial and final documents, and serialization or persistence roundtrips preserve the document.

Graph, workflow, timeline, layer, and later editor packages should run this harness against public package APIs. Domain rules remain in those downstream packages; the conformance layer only checks generic mechanics.

Source-mode and packed-consumer compatibility remain repository/distribution concerns. They should continue to be enforced by each repository's deterministic validation contract alongside this semantic conformance suite rather than being represented as runtime editor APIs.
