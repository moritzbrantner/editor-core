import { describe, expect, test } from "vitest";

import {
  commitEditorSnapshotHistory,
  createEditorSnapshotHistory,
  redoEditorSnapshotHistory,
  undoEditorSnapshotHistory,
} from "./history.js";
import { checkEditorConformanceSuite } from "./conformance.js";

type Document = { value: number };
type Action = { delta: number };

function createSuite() {
  const apply = (document: Document, action: Action): Document => ({
    value: document.value + action.delta,
  });

  return {
    createDocument: (): Document => ({ value: 0 }),
    actions: [{ delta: 1 }, { delta: 2 }],
    apply,
    history: {
      create: (document: Document) => createEditorSnapshotHistory(document),
      apply: (history: ReturnType<typeof createEditorSnapshotHistory<Document>>, action: Action) =>
        commitEditorSnapshotHistory(history, apply(history.present, action)),
      undo: undoEditorSnapshotHistory,
      redo: redoEditorSnapshotHistory,
      getDocument: (history: ReturnType<typeof createEditorSnapshotHistory<Document>>) =>
        history.present,
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
    const result = checkEditorConformanceSuite({
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
    const result = checkEditorConformanceSuite({
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
