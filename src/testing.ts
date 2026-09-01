export * from "./testing/adapter-contracts.js";
export * from "./testing/conformance-types.js";
import type {
  EditorFamilyConformanceAdapter,
  EditorFamilyConformanceCaseId,
  EditorFamilyConformanceCaseResult,
  EditorFamilyConformanceDiagnostic,
  EditorFamilyConformanceInteractionKind,
  EditorFamilyConformanceReport,
} from "./testing/conformance-types.js";

export class EditorFamilyConformanceError extends Error {
  readonly report: EditorFamilyConformanceReport;

  constructor(report: EditorFamilyConformanceReport) {
    super(formatEditorFamilyConformanceReport(report));
    this.name = "EditorFamilyConformanceError";
    this.report = report;
  }
}

export async function runEditorFamilyConformance<TDocument, TSelection, TRuntime>(
  adapter: EditorFamilyConformanceAdapter<TDocument, TSelection, TRuntime>,
): Promise<EditorFamilyConformanceReport> {
  const testCases: readonly {
    id: EditorFamilyConformanceCaseId;
    run: () => Promise<string | null>;
  }[] = [
    {
      id: "normalization-idempotent",
      async run() {
        const normalized = await adapter.normalize(adapter.fixtures.initialDocument);
        const normalizedAgain = await adapter.normalize(normalized);
        return adapter.documentsEqual(normalized, normalizedAgain)
          ? null
          : "Normalizing an already normalized document changed its semantic value.";
      },
    },
    {
      id: "serialization-roundtrip",
      async run() {
        const normalized = await adapter.normalize(adapter.fixtures.initialDocument);
        const parsed = await adapter.parseAndMigrate(await adapter.serialize(normalized));
        if (parsed.status === "failure") {
          return `Serialized document was rejected: ${formatConformanceDiagnostics(parsed.diagnostics)}.`;
        }
        return adapter.documentsEqual(normalized, parsed.document)
          ? null
          : "Serializing and parsing changed the semantic document.";
      },
    },
    {
      id: "migration-roundtrip",
      async run() {
        const parsed = await adapter.parseAndMigrate(adapter.fixtures.migration.input);
        if (parsed.status === "failure") {
          return `Migration fixture was rejected: ${formatConformanceDiagnostics(parsed.diagnostics)}.`;
        }
        const expected = await adapter.normalize(adapter.fixtures.migration.expectedDocument);
        return adapter.documentsEqual(expected, parsed.document)
          ? null
          : "Migrating the legacy fixture did not preserve its semantic document.";
      },
    },
    {
      id: "invalid-import-diagnostics",
      async run() {
        const parsed = await adapter.parseAndMigrate(adapter.fixtures.invalidImport);
        if (parsed.status === "success") {
          return "Invalid import was accepted.";
        }
        if (
          parsed.diagnostics.length === 0 ||
          parsed.diagnostics.some(
            (diagnostic) =>
              typeof diagnostic.path !== "string" ||
              typeof diagnostic.message !== "string" ||
              diagnostic.message.length === 0,
          )
        ) {
          return "Invalid import did not return structured path/message diagnostics.";
        }
        return null;
      },
    },
    {
      id: "custom-data-preserved",
      async run() {
        const normalized = await adapter.normalize(adapter.fixtures.customDataDocument);
        const parsed = await adapter.parseAndMigrate(await adapter.serialize(normalized));
        if (parsed.status === "failure") {
          return `Custom-data fixture was rejected: ${formatConformanceDiagnostics(parsed.diagnostics)}.`;
        }
        return adapter.documentsEqual(normalized, parsed.document)
          ? null
          : "Normalization and serialization did not preserve JSON-compatible custom data.";
      },
    },
    {
      id: "history-restores-document-and-selection",
      async run() {
        const runtime = await adapter.createRuntime(
          adapter.fixtures.initialDocument,
          adapter.fixtures.initialSelection,
        );
        const edited = await adapter.edit(
          runtime,
          adapter.fixtures.editedDocument,
          adapter.fixtures.editedSelection,
        );
        const undone = await adapter.undo(edited);
        if (
          !adapter.documentsEqual(
            adapter.getDocument(undone),
            await adapter.normalize(adapter.fixtures.initialDocument),
          ) ||
          !adapter.selectionsEqual(adapter.getSelection(undone), adapter.fixtures.initialSelection)
        ) {
          return "Undo did not restore the initial document and selection.";
        }
        const redone = await adapter.redo(undone);
        if (
          !adapter.documentsEqual(
            adapter.getDocument(redone),
            await adapter.normalize(adapter.fixtures.editedDocument),
          ) ||
          !adapter.selectionsEqual(adapter.getSelection(redone), adapter.fixtures.editedSelection)
        ) {
          return "Redo did not restore the edited document and selection.";
        }
        return null;
      },
    },
    {
      id: "read-only-command-does-not-mutate",
      async run() {
        const runtime = await adapter.createRuntime(
          adapter.fixtures.initialDocument,
          adapter.fixtures.initialSelection,
        );
        const result = await adapter.runMutationCommand(runtime, { readOnly: true });
        return adapter.documentsEqual(adapter.getDocument(runtime), adapter.getDocument(result)) &&
          !adapter.isDirty(result) &&
          !adapter.canUndo(result)
          ? null
          : "A registered mutation command changed read-only runtime state.";
      },
    },
    {
      id: "dirty-state-follows-semantic-edits",
      async run() {
        let runtime = await adapter.createRuntime(
          adapter.fixtures.initialDocument,
          adapter.fixtures.initialSelection,
        );
        if (adapter.isDirty(runtime)) {
          return "A newly created runtime started dirty.";
        }
        runtime = await adapter.setSelection(runtime, adapter.fixtures.editedSelection);
        if (adapter.isDirty(runtime)) {
          return "Selection-only changes marked the runtime dirty.";
        }
        runtime = await adapter.edit(
          runtime,
          adapter.fixtures.equivalentDocument,
          adapter.fixtures.editedSelection,
        );
        if (adapter.isDirty(runtime)) {
          return "A semantically equivalent document edit marked the runtime dirty.";
        }
        runtime = await adapter.edit(
          runtime,
          adapter.fixtures.editedDocument,
          adapter.fixtures.editedSelection,
        );
        if (!adapter.isDirty(runtime)) {
          return "A semantic document edit did not mark the runtime dirty.";
        }
        runtime = await adapter.markSaved(runtime);
        if (adapter.isDirty(runtime)) {
          return "Marking the current document saved left the runtime dirty.";
        }
        runtime = await adapter.setSelection(runtime, adapter.fixtures.initialSelection);
        return adapter.isDirty(runtime)
          ? "A selection-only change after saving marked the runtime dirty."
          : null;
      },
    },
    createCancelledInteractionCase(adapter, "drag"),
    createCancelledInteractionCase(adapter, "resize"),
  ];

  const cases: EditorFamilyConformanceCaseResult[] = [];
  for (const testCase of testCases) {
    try {
      const message = await testCase.run();
      cases.push(
        message === null
          ? { id: testCase.id, status: "passed" }
          : { id: testCase.id, message, status: "failed" },
      );
    } catch (error) {
      cases.push({
        id: testCase.id,
        message: error instanceof Error ? error.message : "Conformance case threw an error.",
        status: "failed",
      });
    }
  }

  return {
    adapterId: adapter.id,
    cases,
    ok: cases.every((testCase) => testCase.status === "passed"),
  };
}

export async function assertEditorFamilyConformance<TDocument, TSelection, TRuntime>(
  adapter: EditorFamilyConformanceAdapter<TDocument, TSelection, TRuntime>,
): Promise<void> {
  const report = await runEditorFamilyConformance(adapter);
  if (!report.ok) {
    throw new EditorFamilyConformanceError(report);
  }
}

function createCancelledInteractionCase<TDocument, TSelection, TRuntime>(
  adapter: EditorFamilyConformanceAdapter<TDocument, TSelection, TRuntime>,
  kind: EditorFamilyConformanceInteractionKind,
): {
  id: EditorFamilyConformanceCaseId;
  run: () => Promise<string | null>;
} {
  return {
    id:
      kind === "drag"
        ? "cancelled-drag-does-not-enter-history"
        : "cancelled-resize-does-not-enter-history",
    async run() {
      const runtime = await adapter.createRuntime(
        adapter.fixtures.initialDocument,
        adapter.fixtures.initialSelection,
      );
      const cancelled = await adapter.cancelInteraction(runtime, kind);
      return adapter.documentsEqual(adapter.getDocument(runtime), adapter.getDocument(cancelled)) &&
        adapter.selectionsEqual(adapter.getSelection(runtime), adapter.getSelection(cancelled)) &&
        !adapter.isDirty(cancelled) &&
        !adapter.canUndo(cancelled)
        ? null
        : `Cancelled ${kind} interaction changed runtime state or entered history.`;
    },
  };
}

function formatConformanceDiagnostics(
  diagnostics: readonly EditorFamilyConformanceDiagnostic[],
): string {
  return diagnostics.map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`).join("; ");
}

function formatEditorFamilyConformanceReport(report: EditorFamilyConformanceReport): string {
  const failures = report.cases.filter(
    (testCase): testCase is Extract<EditorFamilyConformanceCaseResult, { status: "failed" }> =>
      testCase.status === "failed",
  );
  return failures.length === 0
    ? `Editor family adapter ${report.adapterId} conforms.`
    : failures.map((testCase) => `${testCase.id}: ${testCase.message}`).join("; ");
}
