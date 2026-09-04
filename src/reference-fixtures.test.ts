import { describe, expect, test } from "vitest";
import { createEditorEntityDocument, type EditorBounds } from "./entities.js";
import { createEditorEntityIndexes } from "./indexes.js";
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

describe("headless editor kernel reference fixtures", () => {
  test("layer reorder is one undoable transaction without a layer ontology", () => {
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
    const redone = redoEditorOperationRuntime(undone);
    expect(redone.runtime.document.layers.layerA.order).toBe(3);
  });

  test("2D drag merges while graph validation remains caller-owned", () => {
    const initial: GraphDocumentFixture = {
      edges: [],
      nodes: {
        a: { bounds: { height: 40, width: 80, x: 0, y: 0 }, id: "a", type: "node" },
        b: { bounds: { height: 40, width: 80, x: 160, y: 0 }, id: "b", type: "node" },
      },
    };
    let runtime = createEditorOperationRuntime<GraphDocumentFixture, EditorSelection>({
      initialDocument: initial,
      initialSelection: createEditorEntitySelection(["a"]),
      preflight({ operation }) {
        if (operation.id !== "connect") {
          return [];
        }
        return validateGraphConnection({ sourceId: "a", targetId: "a" }, "edges.next");
      },
    });

    runtime = applyEditorOperation(runtime, moveGraphNode(20), { merge: true });
    runtime = applyEditorOperation(runtime, moveGraphNode(40), { merge: true });

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
    expect(viewport?.zoom).toBeGreaterThan(0);
    expect(runtime.issues).toEqual([
      { path: "edges.next", message: "Connections must target a different entity." },
    ]);
  });

  test("workflow-specific rules plug into generic preflight", () => {
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
        return operation.id === "connect-end-start"
          ? [{ path: "transitions.next", message: "End nodes cannot have outgoing transitions." }]
          : [];
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

    expect(runtime.runtime.document.transitions).toHaveLength(1);
    expect(runtime.issues).toEqual([
      { path: "transitions.next", message: "End nodes cannot have outgoing transitions." },
    ]);
  });

  test("timeline trim uses generic snapping while time semantics stay caller-owned", () => {
    const initial: TimelineDocumentFixture = {
      clips: {
        clip: { id: "clip", range: { end: 10, start: 0 }, trackId: "track", type: "clip" },
      },
      playhead: 0,
      tracks: { track: { id: "track", type: "track" } },
    };
    const selection = createEditorEntitySelection(["clip"]);
    let runtime = createEditorOperationRuntime<TimelineDocumentFixture, EditorSelection>({
      initialDocument: initial,
      initialSelection: selection,
      preflight({ operation }) {
        const next = operation.apply(runtime.runtime.document);
        return validateTimelineRange(next.clips.clip.range, "clips.clip.range");
      },
    });
    const snappedEnd = snapEditorValue(11.8, [{ kind: "frame", value: 12 }], 0.5).value;

    runtime = applyEditorOperation(runtime, trimClipEnd(snappedEnd, selection), { merge: true });
    runtime = applyEditorOperation(runtime, trimClipEnd(12, selection), { merge: true });

    expect(runtime.runtime.document.clips.clip.range).toEqual({ end: 12, start: 0 });
    expect(runtime.operationHistory.undoStack).toHaveLength(1);

    runtime = undoEditorOperationRuntime(runtime);
    expect(runtime.runtime.document.clips.clip.range).toEqual({ end: 10, start: 0 });
    expect(runtime.runtime.selection).toEqual(selection);
  });

  test("persistence saves dirty runtime documents and reloads clean state", async () => {
    const storage = createMemoryStorage<{ title: string }>(null);
    let runtime = createEditorRuntime({ initialDocument: { title: "Draft" } });

    runtime = commitEditorRuntime(runtime, { title: "Saved" });
    const saved = await saveEditorRuntimePersistence(runtime, storage);
    const loaded = await loadEditorRuntimePersistence(
      createEditorRuntime({ initialDocument: { title: "Fallback" } }),
      storage,
    );

    expect(saved.saved).toBe(true);
    expect(saved.runtime.status).toBe("clean");
    expect(loaded.runtime.document).toEqual({ title: "Saved" });
  });
});

function validateGraphConnection(connection: { sourceId: string; targetId: string }, path: string) {
  return connection.sourceId === connection.targetId
    ? [{ path, message: "Connections must target a different entity." }]
    : [];
}

function validateTimelineRange(range: { start: number; end: number }, path: string) {
  return range.end > range.start ? [] : [{ path, message: "Range end must be after range start." }];
}

function moveGraphNode(x: number): EditorOperation<GraphDocumentFixture, EditorSelection> {
  return {
    apply: (document) => ({
      ...document,
      nodes: {
        ...document.nodes,
        a: { ...document.nodes.a, bounds: { ...document.nodes.a.bounds, x } },
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
        clip: { ...document.clips.clip, range: { ...document.clips.clip.range, end } },
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
