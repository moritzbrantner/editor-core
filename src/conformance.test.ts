import { describe, expect, test } from "vitest";

import type { EditorConformanceSuite } from "./conformance.js";
import { checkEditorConformanceSuite } from "./conformance.js";
import {
  commitEditorSnapshotHistory,
  createEditorSnapshotHistory,
  createEditorTransactionHistory,
  pushEditorTransactionHistory,
  redoEditorSnapshotHistory,
  redoEditorTransactionHistory,
  undoEditorSnapshotHistory,
  undoEditorTransactionHistory,
  type EditorTransactionHistory,
} from "./history.js";

type Document = { value: number; custom?: unknown };
type Action = { delta: number };
type History = ReturnType<typeof createEditorSnapshotHistory<Document>>;
type Selection = { id: string };
type SelectionHistory = {
  document: Document;
  history: EditorTransactionHistory<Document, Selection>;
  selection: Selection;
};

type Suite = EditorConformanceSuite<Document, Action, History, string, Document>;
type SelectionSuite = EditorConformanceSuite<
  Document,
  Action,
  SelectionHistory,
  never,
  never,
  Selection
>;

function applyAction(document: Document, action: Action): Document {
  return {
    ...document,
    value: document.value + action.delta,
  };
}

function createSuite(): Suite {
  return {
    createDocument: (): Document => ({ value: 0 }),
    actions: [{ delta: 1 }, { delta: 2 }],
    apply: applyAction,
    normalization: {
      normalize: (document: Document): Document => ({
        ...document,
        value: Math.trunc(document.value),
      }),
    },
    history: {
      create: (document: Document) => createEditorSnapshotHistory(document),
      apply: (history: History, action: Action) =>
        commitEditorSnapshotHistory(history, applyAction(history.present, action)),
      undo: undoEditorSnapshotHistory,
      redo: redoEditorSnapshotHistory,
      getDocument: (history: History) => history.present,
    },
    serialization: {
      serialize: (document: Document) => JSON.stringify(document),
      parse: (serialized: string) => JSON.parse(serialized) as Document,
      cases: [
        {
          document: {
            value: 7,
            custom: {
              plugin: "example",
              nested: [1, true, null, { label: "kept" }],
            },
          },
          name: "unknown-custom-data",
        },
      ],
    },
    migration: {
      cases: [
        {
          input: JSON.stringify({ legacyValue: 3 }),
          expectedDocument: { value: 3 },
          name: "v1",
        },
      ],
      migrate: (serialized: string): string => {
        const legacy = JSON.parse(serialized) as { legacyValue: number };
        return JSON.stringify({ value: legacy.legacyValue });
      },
      parse: (serialized: string) => JSON.parse(serialized) as Document,
    },
    persistence: {
      serialize: (document: Document) => structuredClone(document),
      parse: (persisted: Document) => structuredClone(persisted),
    },
  };
}

function createSelectionSuite(): SelectionSuite {
  return {
    createDocument: (): Document => ({ value: 0 }),
    actions: [{ delta: 1 }, { delta: 2 }],
    apply: applyAction,
    history: {
      create(document) {
        return {
          document,
          history: createEditorTransactionHistory<Document, Selection>(),
          selection: { id: "initial" },
        };
      },
      apply(state, action) {
        const document = applyAction(state.document, action);
        const selection = { id: `value-${document.value}` };
        return {
          document,
          history: pushEditorTransactionHistory(state.history, {
            after: document,
            before: state.document,
            id: `value-${document.value}`,
            selectionAfter: selection,
            selectionBefore: state.selection,
          }),
          selection,
        };
      },
      undo(state) {
        const result = undoEditorTransactionHistory(state.history, state.selection);
        return {
          document: result.document ?? state.document,
          history: result.history,
          selection: result.selection ?? state.selection,
        };
      },
      redo(state) {
        const result = redoEditorTransactionHistory(state.history, state.selection);
        return {
          document: result.document ?? state.document,
          history: result.history,
          selection: result.selection ?? state.selection,
        };
      },
      getDocument: (state) => state.document,
      getSelection: (state) => state.selection,
    },
  };
}

describe("editor conformance", () => {
  test("accepts deterministic transitions, normalization, history, migration, and roundtrips", () => {
    expect(checkEditorConformanceSuite(createSuite())).toEqual({ ok: true, issues: [] });
  });

  test("accepts transaction history that restores selection on undo and redo", () => {
    expect(checkEditorConformanceSuite(createSelectionSuite())).toEqual({ ok: true, issues: [] });
  });

  test("detects in-place document mutation", () => {
    const suite = createSuite();
    const result = checkEditorConformanceSuite<Document, Action, History, string, Document>({
      ...suite,
      history: undefined,
      apply(document, action) {
        document.value += action.delta;
        return document;
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: "transition",
          message: expect.stringContaining("mutated"),
        }),
      ]),
    );
  });

  test("reports non-idempotent normalization independently", () => {
    const suite = createSuite();
    const result = checkEditorConformanceSuite({
      ...suite,
      normalization: {
        normalize: (document: Document): Document => ({ value: document.value + 1 }),
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        capability: "normalization",
        message: expect.stringContaining("already normalized"),
      }),
    ]);
  });

  test("reports migration mismatches with the case name", () => {
    const suite = createSuite();
    const result = checkEditorConformanceSuite({
      ...suite,
      migration: {
        cases: [{ input: "legacy", expectedDocument: { value: 3 }, name: "v1" }],
        migrate: (serialized: string) => serialized,
        parse: (_serialized: string): Document => ({ value: -1 }),
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        capability: "migration",
        path: "v1",
        message: expect.stringContaining("expected document"),
      }),
    ]);
  });

  test("reports named serialization cases that lose custom data", () => {
    const suite = createSuite();
    const result = checkEditorConformanceSuite({
      ...suite,
      serialization: {
        serialize: (document: Document) => JSON.stringify({ value: document.value }),
        parse: (serialized: string) => JSON.parse(serialized) as Document,
        cases: suite.serialization?.cases,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        capability: "serialization",
        path: "unknown-custom-data",
        message: expect.stringContaining("roundtrip changed"),
      }),
    ]);
  });

  test("reports broken persistence roundtrips independently", () => {
    const suite = createSuite();
    const result = checkEditorConformanceSuite<Document, Action, History, string, number>({
      ...suite,
      persistence: {
        serialize: (document: Document) => document.value,
        parse: (_value: number): Document => ({ value: -1 }),
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([expect.objectContaining({ capability: "persistence" })]);
  });

  test("reports when undo does not restore selection", () => {
    const suite = createSelectionSuite();
    const history = suite.history;
    if (!history) {
      throw new Error("Selection suite requires history.");
    }

    const result = checkEditorConformanceSuite({
      ...suite,
      history: {
        ...history,
        undo(state) {
          const restored = history.undo(state);
          return { ...restored, selection: { id: "wrong-after-undo" } };
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: "history",
          message: expect.stringContaining("initial selection"),
        }),
      ]),
    );
  });

  test("reports when redo does not restore selection", () => {
    const suite = createSelectionSuite();
    const history = suite.history;
    if (!history) {
      throw new Error("Selection suite requires history.");
    }

    const result = checkEditorConformanceSuite({
      ...suite,
      history: {
        ...history,
        redo(state) {
          const restored = history.redo(state);
          return { ...restored, selection: { id: "wrong-after-redo" } };
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: "history",
          message: expect.stringContaining("final selection"),
        }),
      ]),
    );
  });
});
