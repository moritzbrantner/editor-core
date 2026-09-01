# Editor-family conformance

`@moenarch/editor-core/testing` exports a framework- and test-runner-neutral conformance suite for
graph, workflow, timeline, and other editor-family adapters.

Implement `EditorFamilyConformanceAdapter` with representative fixtures and transitions from the
host editor, then call `runEditorFamilyConformance` from the repository's test runner:

```ts
import { runEditorFamilyConformance } from "@moenarch/editor-core/testing";

const report = await runEditorFamilyConformance(adapter);
expect(report.cases).toSatisfyAll((testCase) => testCase.status === "passed");
```

Use `assertEditorFamilyConformance` when the test runner supports rejected promises. It throws one
`EditorFamilyConformanceError` containing the full structured report.

## Adapter contract

The adapter supplies current, semantically equivalent, edited, custom-data, invalid-import, and
legacy migration fixtures. Its methods expose only the stable seams needed to observe document,
selection, history, command, interaction, and dirty-state behavior. Methods may be synchronous or
asynchronous.

The suite runs these cases in stable order:

1. normalization is idempotent;
2. current serialization parses without semantic change;
3. a legacy fixture migrates without semantic change;
4. invalid imports return path/message diagnostics;
5. JSON-compatible custom data survives normalization and serialization;
6. undo and redo restore document and selection;
7. mutation commands cannot change a read-only runtime;
8. only semantic document edits change dirty/saved state;
9. cancelled drag interactions do not change state or history;
10. cancelled resize interactions do not change state or history.

Each downstream repository owns its adapter and invokes the suite in its own CI. Editor Core also
runs the suite from a packed tarball consumer so package exports and runtime behavior are verified
together.
