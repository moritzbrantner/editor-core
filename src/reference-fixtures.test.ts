import { describe, expect, test } from "vitest";
import { validateEditorGraphConnection, validateEditorTimelineRange } from "./constraints.js";
import { createEditorEntityDocument, type EditorBounds } from "./entities.js";
import {
  createEditorEntityIndexes,
  createEditorGraphIndexes,
  createEditorTimelineIndexes,
} from "./indexes.js";
import {
  applyEditorOperation,
  createEditorOperationRuntime,
  redoEditorOperationRuntime,
  undoEditorOperationRuntime,
  type EditorOperation,
} from "./operations.js";
import { loadEditorRuntimePersistence, saveEditorRuntimePersistence } from "./persistence.js";
import { commitEditorRuntime, createEditorRuntime } from "./runtime.js";
import { createEditorEntitySelection, type EditorSelection } from "./selection.js";
import { projectEditorTree } from "./tree.js";
import { revealEditorBounds, snapEditorValue } from "./viewport.js";

describe("headless reference editor fixtures", () => {
  test("layer reorder is one undoable transaction", () => {
    type Layer = {
      id: string;
      locked: boolean;
      order: number;
      parentId?: string | null;
      type: "group" | "layer";
      visible: boolean;
    };
    type LayerDocument = {
      layers: Record<string, Layer>;
      rootIds: readonly string[];
    };
    const initial: LayerDocument = {
      layers: {
        group: { id: "group", locked: false, order: 0, type: "group", visible: true },
        layerA: {
          id: "layerA",
          locked: false,
          order: 1,
          parentId: "group",
          type: "layer",
          visible: true,
        },
        layerB: {
          id: "layerB",
          locked: false,
          order: 2,
          parentId: "group",
          type: "layer",
          visible: false,
        },
      },
      rootIds: ["group"],
    };
    const selection = createEditorEntitySelection(["layerA"]);
    let runtime = createEditorOperationRuntime<LayerDocument, EditorSelection>({
      initialDocument: initial,
      initialSelection: selection,
    });

    const entityDocument = createEditorEntityDocument(
      Object.values(initial.layers),
      initial.rootIds,
    );
    const indexes = createEditorEntityIndexes(entityDocument);
    const tree = projectEditorTree(initial, {
      getRoot(document) {
        return {
          children: document.rootIds.map((id) => ({ id, label: document.layers[id].id })),
          expandedByDefault: true,
          id: "document",
          label: "Layers",
        };
      },
    });

    runtime = applyEditorOperation(
      runtime,
      {
        apply: (document) => ({
          ...document,
          layers: {
            ...document.layers,
            layerA: { ...document.layers.layerA, order: 3 },
            layerB: { ...document.layers.layerB, order: 1 },
          },
        }),
        id: "reorder-layer",
        mergeKey: "reorder:group",
        selectionAfter: selection,
      },
      { merge: true },
    );

    expect(indexes.childrenByParentId.get("group")?.map((layer) => layer.id)).toEqual([
      "layerA",
      "layerB",
    ]);
    expect(tree.items.map((item) => item.node.id)).toEqual(["document", "group"]);
    expect(runtime.operationHistory.undoStack).toHaveLength(1);

    const undone = undoEditorOperationRuntime(runtime);
    expect(undone.runtime.document.layers.layerA.order).toBe(1);
    expect(
      createEditorEntityIndexes(
        createEditorEntityDocument(Object.values(undone.runtime.document.layers)),
      )
        .childrenByParentId.get("group")
        ?.map((layer) => layer.id),
    ).toEqual(["layerA", "layerB"]);

    const redone = redoEditorOperationRuntime(undone);
    expect(redone.runtime.document.layers.layerA.order).toBe(3);
  });

  test("graph drag merges and connection validation blocks invalid edges", () => {
    type GraphDocument = {
      edges: Array<{ id: string; sourceId: string; targetId: string }>;
      nodes: Record<string, { bounds: EditorBounds; id: string; type: "node" }>;
    };
    const initial: GraphDocument = {
      edges: [],
      nodes: {
        a: { bounds: { height: 40, width: 80, x: 0, y: 0 }, id: "a", type: "node" },
        b: { bounds: { height: 40, width: 80, x: 160, y: 0 }, id: "b", type: "node" },
      },
    };
    let runtime = createEditorOperationRuntime<GraphDocument, EditorSelection>({
      initialDocument: initial,
      initialSelection: createEditorEntitySelection(["a"]),
      preflight({ operation }) {
        if (operation.id !== "connect") {
          return [];
        }
        return validateEditorGraphConnection(
          { sourceId: "a", targetId: "a" },
          { path: "edges.next" },
        );
      },
    });

    runtime = applyEditorOperation(runtime, moveGraphNode(20), { merge: true });
    runtime = applyEditorOperation(runtime, moveGraphNode(40), { merge: true });

    const graphIndexes = createEditorGraphIndexes([{ id: "edge", sourceId: "a", targetId: "b" }]);
    const viewport = revealEditorBounds(
      Object.values(runtime.runtime.document.nodes).map((node) => node.bounds),
      { viewportSize: { height: 100, width: 320 } },
    );

    runtime = applyEditorOperation(runtime, {
      apply: (document) => ({
        ...document,
        edges: [...document.edges, { id: "self", sourceId: "a", targetId: "a" }],
      }),
      id: "connect",
    });

    expect(runtime.operationHistory.undoStack).toHaveLength(1);
    expect(undoEditorOperationRuntime(runtime).runtime.document.nodes.a.bounds.x).toBe(0);
    expect(graphIndexes.outgoingEdgesByNodeId.get("a")?.[0]?.targetId).toBe("b");
    expect(viewport?.zoom).toBeGreaterThan(0);
    expect(runtime.issues).toEqual([
      { path: "edges.next", message: "Connections must target a different entity." },
    ]);

    runtime = applyEditorOperation(runtime, {
      apply: (document) => ({
        ...document,
        edges: [...document.edges, { id: "a-b", sourceId: "a", targetId: "b" }],
      }),
      id: "connect-valid",
      selectionAfter: createEditorEntitySelection(["a-b"]),
    });
    expect(runtime.issues).toEqual([]);
    expect(runtime.runtime.document.edges).toEqual([{ id: "a-b", sourceId: "a", targetId: "b" }]);
  });

  test("workflow invalid transition is blocked through preflight", () => {
    type WorkflowDocument = {
      nodes: Record<string, { id: string; type: "start" | "action" | "end" }>;
      transitions: Array<{ id: string; sourceId: string; targetId: string }>;
    };
    const initial: WorkflowDocument = {
      nodes: {
        action: { id: "action", type: "action" },
        end: { id: "end", type: "end" },
        start: { id: "start", type: "start" },
      },
      transitions: [{ id: "start-action", sourceId: "start", targetId: "action" }],
    };
    let runtime = createEditorOperationRuntime<WorkflowDocument, EditorSelection>({
      initialDocument: initial,
      initialSelection: createEditorEntitySelection(["action"]),
      preflight({ operation }) {
        if (operation.id !== "connect-end-start") {
          return [];
        }
        return validateEditorGraphConnection(
          { sourceId: "end", targetId: "start" },
          {
            canConnect: (connection) => connection.sourceId !== "end",
            path: "transitions.next",
          },
        );
      },
    });
    const tree = projectEditorTree(initial, {
      getRoot(document) {
        return {
          children: Object.values(document.nodes).map((node) => ({
            id: node.id,
            kind: node.type,
            label: node.id,
          })),
          expandedByDefault: true,
          id: "workflow",
          label: "Workflow",
        };
      },
    });

    runtime = applyEditorOperation(runtime, {
      apply: (document) => ({
        ...document,
        transitions: [
          ...document.transitions,
          { id: "end-start", sourceId: "end", targetId: "start" },
        ],
      }),
      id: "connect-end-start",
    });

    expect(tree.items.map((item) => item.node.id)).toContain("action");
    expect(runtime.runtime.document.transitions).toHaveLength(1);
    expect(runtime.issues).toEqual([
      { path: "transitions.next", message: "Connection is not allowed." },
    ]);
  });

  test("timeline trim snaps and undo restores range plus selection", () => {
    type TimelineDocument = {
      clips: Record<
        string,
        { id: string; range: { end: number; start: number }; trackId: string; type: "clip" }
      >;
      playhead: number;
      tracks: Record<string, { id: string; type: "track" }>;
    };
    const initial: TimelineDocument = {
      clips: {
        clip: { id: "clip", range: { end: 10, start: 0 }, trackId: "track", type: "clip" },
      },
      playhead: 0,
      tracks: { track: { id: "track", type: "track" } },
    };
    const selection = createEditorEntitySelection(["clip"]);
    let runtime = createEditorOperationRuntime<TimelineDocument, EditorSelection>({
      initialDocument: initial,
      initialSelection: selection,
    });
    const snappedEnd = snapEditorValue(11.8, [{ kind: "frame", value: 12 }], 0.5).value;

    runtime = applyEditorOperation(runtime, trimClipEnd(snappedEnd, selection), { merge: true });
    runtime = applyEditorOperation(runtime, trimClipEnd(12, selection), { merge: true });

    const indexes = createEditorTimelineIndexes(Object.values(runtime.runtime.document.clips));
    expect(validateEditorTimelineRange(runtime.runtime.document.clips.clip.range)).toEqual([]);
    expect(indexes.trackItemsByTrackId.get("track")?.[0]?.id).toBe("clip");
    expect(runtime.operationHistory.undoStack).toHaveLength(1);

    runtime = undoEditorOperationRuntime(runtime);
    expect(runtime.runtime.document.clips.clip.range).toEqual({ end: 10, start: 0 });
    expect(runtime.runtime.selection).toEqual(selection);
  });

  test("persistence saves dirty runtime documents and reloads clean state", async () => {
    const storage = createMemoryStorage<{ title: string }>(null);
    let runtime = createEditorRuntime({
      initialDocument: { title: "Draft" },
    });

    runtime = commitEditorRuntime(runtime, { title: "Saved" });
    expect(runtime.status).toBe("dirty");

    const saved = await saveEditorRuntimePersistence(runtime, storage);
    expect(saved.saved).toBe(true);
    expect(saved.runtime.status).toBe("clean");
    expect(storage.value).toEqual({ title: "Saved" });

    const loaded = await loadEditorRuntimePersistence(
      createEditorRuntime({ initialDocument: { title: "Fallback" } }),
      storage,
    );
    expect(loaded.runtime.document).toEqual({ title: "Saved" });
    expect(loaded.runtime.status).toBe("clean");
  });
});

function moveGraphNode(x: number): EditorOperation<GraphDocumentFixture, EditorSelection> {
  return {
    apply: (document) => ({
      ...document,
      nodes: {
        ...document.nodes,
        a: {
          ...document.nodes.a,
          bounds: {
            ...document.nodes.a.bounds,
            x,
          },
        },
      },
    }),
    id: "drag-node",
    mergeKey: "drag:a",
    selectionAfter: createEditorEntitySelection(["a"]),
  };
}

function trimClipEnd(
  end: number,
  selection: EditorSelection,
): EditorOperation<TimelineDocumentFixture, EditorSelection> {
  return {
    apply: (document) => ({
      ...document,
      clips: {
        ...document.clips,
        clip: {
          ...document.clips.clip,
          range: { ...document.clips.clip.range, end },
        },
      },
    }),
    id: "trim-clip",
    mergeKey: "trim:clip:end",
    selectionAfter: selection,
  };
}

type GraphDocumentFixture = {
  edges: Array<{ id: string; sourceId: string; targetId: string }>;
  nodes: Record<string, { bounds: EditorBounds; id: string; type: "node" }>;
};

type TimelineDocumentFixture = {
  clips: Record<
    string,
    { id: string; range: { end: number; start: number }; trackId: string; type: "clip" }
  >;
  playhead: number;
  tracks: Record<string, { id: string; type: "track" }>;
};

function createMemoryStorage<TValue>(initialValue: TValue | null) {
  return {
    value: initialValue,
    load() {
      return this.value;
    },
    save(value: TValue) {
      this.value = value;
    },
  };
}
