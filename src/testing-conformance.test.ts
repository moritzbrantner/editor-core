import { describe, expect, test } from "vitest";
import {
  beginEditorInteraction,
  cancelEditorInteraction,
  createEditorInteractionSession,
  updateEditorInteractionPreview,
  type EditorInteractionState,
} from "./interaction.js";
import { createStableEditorJsonEquals, type EditorJsonValue } from "./json.js";
import {
  applyEditorOperation,
  createEditorOperationRuntime,
  redoEditorOperationRuntime,
  undoEditorOperationRuntime,
  type EditorOperationRuntimeState,
} from "./operations.js";
import {
  assertEditorFamilyConformance,
  EditorFamilyConformanceError,
  runEditorFamilyConformance,
  type EditorFamilyConformanceAdapter,
  type EditorFamilyConformanceParseResult,
} from "./testing.js";

type Document = {
  title: string;
  custom: Record<string, EditorJsonValue>;
};

type Selection = { focus: string };
type Runtime = {
  operation: EditorOperationRuntimeState<Document, Selection>;
  savedDocument: Document;
};

const documentsEqual = createStableEditorJsonEquals<Document>();
const selectionsEqual = createStableEditorJsonEquals<Selection | null>();

describe("editor-family conformance", () => {
  test("runs the complete framework-neutral contract against a family adapter", async () => {
    const report = await runEditorFamilyConformance(createReferenceAdapter());

    expect(report.cases.filter((testCase) => testCase.status === "failed")).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.adapterId).toBe("reference-editor");
    expect(report.cases.map((testCase) => testCase.id)).toEqual([
      "normalization-idempotent",
      "serialization-roundtrip",
      "migration-roundtrip",
      "invalid-import-diagnostics",
      "custom-data-preserved",
      "history-restores-document-and-selection",
      "read-only-command-does-not-mutate",
      "dirty-state-follows-semantic-edits",
      "cancelled-drag-does-not-enter-history",
      "cancelled-resize-does-not-enter-history",
    ]);
    expect(report.cases.every((testCase) => testCase.status === "passed")).toBe(true);
    await expect(assertEditorFamilyConformance(createReferenceAdapter())).resolves.toBeUndefined();
  });

  test("returns structured failures and throws an aggregate assertion error", async () => {
    const adapter = createReferenceAdapter();
    const brokenAdapter: EditorFamilyConformanceAdapter<Document, Selection, Runtime> = {
      ...adapter,
      normalize(document) {
        return { ...document, title: `${document.title}!` };
      },
    };

    const report = await runEditorFamilyConformance(brokenAdapter);

    expect(report.ok).toBe(false);
    expect(report.cases).toContainEqual({
      id: "normalization-idempotent",
      message: "Normalizing an already normalized document changed its semantic value.",
      status: "failed",
    });
    await expect(assertEditorFamilyConformance(brokenAdapter)).rejects.toMatchObject({
      name: "EditorFamilyConformanceError",
      report,
    });

    try {
      await assertEditorFamilyConformance(brokenAdapter);
    } catch (error) {
      expect(error).toBeInstanceOf(EditorFamilyConformanceError);
    }
  });
});

function createReferenceAdapter(): EditorFamilyConformanceAdapter<Document, Selection, Runtime> {
  const initialDocument: Document = { custom: { family: "reference" }, title: "Draft" };
  const editedDocument: Document = { custom: { family: "reference" }, title: "Published" };
  const initialSelection: Selection = { focus: "title" };
  const editedSelection: Selection = { focus: "canvas" };

  return {
    id: "reference-editor",
    fixtures: {
      customDataDocument: {
        custom: { nested: { enabled: true }, pluginData: ["kept", 3] },
        title: "Custom",
      },
      editedDocument,
      editedSelection,
      equivalentDocument: { custom: { family: "reference" }, title: " Draft " },
      initialDocument,
      initialSelection,
      invalidImport: { title: 42 },
      migration: {
        expectedDocument: initialDocument,
        input: { custom: { family: "reference" }, heading: "Draft", version: 0 },
      },
    },
    canUndo(runtime) {
      return runtime.operation.canUndo;
    },
    cancelInteraction(runtime, kind) {
      const interaction: EditorInteractionState =
        kind === "drag"
          ? { ids: ["node"], kind: "dragging", origin: { x: 0, y: 0 } }
          : { handle: "east", id: "node", kind: "resizing" };
      const session = updateEditorInteractionPreview(
        beginEditorInteraction(
          createEditorInteractionSession(runtime.operation.runtime.document),
          interaction,
        ),
        editedDocument,
      );
      cancelEditorInteraction(session);
      return runtime;
    },
    createRuntime(document, selection) {
      return {
        operation: createEditorOperationRuntime({
          history: { equals: documentsEqual, normalize: normalizeDocument },
          initialDocument: document,
          initialSelection: selection,
        }),
        savedDocument: normalizeDocument(document),
      };
    },
    documentsEqual,
    edit(runtime, document, selection) {
      return {
        ...runtime,
        operation: applyEditorOperation(runtime.operation, {
          apply: () => document,
          id: "edit",
          selectionAfter: selection,
          selectionBefore: runtime.operation.runtime.selection ?? undefined,
        }),
      };
    },
    getDocument(runtime) {
      return runtime.operation.runtime.document;
    },
    getSelection(runtime) {
      return runtime.operation.runtime.selection;
    },
    isDirty(runtime) {
      return !documentsEqual(runtime.operation.runtime.document, runtime.savedDocument);
    },
    markSaved(runtime) {
      return { ...runtime, savedDocument: runtime.operation.runtime.document };
    },
    normalize: normalizeDocument,
    parseAndMigrate(input): EditorFamilyConformanceParseResult<Document> {
      if (!input || typeof input !== "object") {
        return {
          diagnostics: [{ message: "Expected document object.", path: "" }],
          status: "failure",
        };
      }

      const value = input as Record<string, unknown>;
      const title = value.version === 0 ? value.heading : value.title;
      if (typeof title !== "string") {
        return {
          diagnostics: [{ message: "Expected string.", path: "title" }],
          status: "failure",
        };
      }

      const custom = value.custom;
      if (!custom || typeof custom !== "object" || Array.isArray(custom)) {
        return {
          diagnostics: [{ message: "Expected custom data object.", path: "custom" }],
          status: "failure",
        };
      }

      return {
        document: normalizeDocument({
          custom: custom as Record<string, EditorJsonValue>,
          title,
        }),
        status: "success",
      };
    },
    runMutationCommand(runtime, options) {
      return options.readOnly
        ? runtime
        : {
            ...runtime,
            operation: applyEditorOperation(runtime.operation, {
              apply: () => editedDocument,
              id: "command",
            }),
          };
    },
    selectionsEqual,
    serialize(document) {
      return normalizeDocument(document);
    },
    setSelection(runtime, selection) {
      return {
        ...runtime,
        operation: applyEditorOperation(runtime.operation, {
          apply: (document) => document,
          id: "selection",
          selectionAfter: selection,
          selectionBefore: runtime.operation.runtime.selection ?? undefined,
        }),
      };
    },
    undo(runtime) {
      return { ...runtime, operation: undoEditorOperationRuntime(runtime.operation) };
    },
    redo(runtime) {
      return { ...runtime, operation: redoEditorOperationRuntime(runtime.operation) };
    },
  };
}

function normalizeDocument(document: Document): Document {
  return { ...document, title: document.title.trim() };
}
