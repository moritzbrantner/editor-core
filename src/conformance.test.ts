import { describe, expect, test } from "vitest";

import type { EditorConformanceSuite } from "./conformance.js";
import { checkEditorConformanceSuite } from "./conformance.js";
import {
  commitEditorSnapshotHistory,
  createEditorSnapshotHistory,
  redoEditorSnapshotHistory,
  undoEditorSnapshotHistory,
} from "./history.js";

type Document = { value: number };
type Action = { delta: number };
type History = ReturnType<typeof createEditorSnapshotHistory<Document>>;

type Suite = EditorConformanceSuite<Document, Action, History, string, Document>;

function createSuite(): Suite {
  const apply = (document: Document, action: Action): Document => ({
    value: document.value + action.delta,
  });

  return {
    createDocument: (): Document => ({ value: 0 }),
    actions: [{ delta: 1 }, { delta: 2 }],
    apply,
    history: {
      create: (document: Document) => createEditorSnapshotHistory(document),
      apply: (history: History, action: Action) =>
        commitEditorSnapshotHistory(history, apply(history.present, action)),
      undo: undoEditorSnapshotHistory,
      redo: redoEditorSnapshotHistory,
      getDocument: (history: History) => history.present,
    },
    serialization: {
      serialize: (document: Document) => JSON.stringify(document),
      parse: (serialized: string) => JSON.parse(serialized) as Document,
    },
    persistence: {
      serialize: (document: Document) => structuredClone(document),
      parse: (persisted: Document) => structuredClone(persisted),
    },
  };
}

describe("editor conformance", () => {
  test("accepts deterministic transitions, full history, and roundtrips", () => {
    expect(checkEditorConformanceSuite(createSuite())).toEqual({ ok: true, issues: [] });
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
});
