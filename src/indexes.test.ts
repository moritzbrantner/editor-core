import { describe, expect, test } from "vitest";
import {
  createEditorEntityDocument,
  createIncrementingEditorIdFactory,
  type EditorGraphAdapter,
  type EditorTimelineAdapter,
} from "./entities.js";
import {
  createEditorEntityIndexes,
  createEditorGraphIndexes,
  createEditorTimelineIndexes,
  groupEditorValidationIssuesByEntityId,
} from "./indexes.js";

describe("editor indexes", () => {
  test("creates deterministic incrementing ids", () => {
    const createId = createIncrementingEditorIdFactory({ prefix: "node" });

    expect(createId()).toBe("node-1");
    expect(createId("edge")).toBe("edge-2");
  });

  test("rejects duplicate entity ids", () => {
    expect(() =>
      createEditorEntityDocument([
        { id: "duplicate", type: "layer" },
        { id: "duplicate", type: "layer" },
      ]),
    ).toThrow('Duplicate editor entity id "duplicate".');
  });

  test("supports document-specific domain adapter generics", () => {
    type GraphDocument = {
      nodes: Array<{ id: string; type: "node"; value: number }>;
      edges: Array<{ id: string; sourceId: string; targetId: string }>;
    };
    const graphAdapter: EditorGraphAdapter<
      GraphDocument,
      GraphDocument["nodes"][number],
      GraphDocument["edges"][number]
    > = {
      getEdges: (document) => document.edges,
      getNodes: (document) => document.nodes,
    };

    type TimelineDocument = {
      tracks: Array<{ id: string; type: "track" }>;
      clips: Array<{
        id: string;
        range: { end: number; start: number };
        trackId: string;
        type: "clip";
      }>;
    };
    const timelineAdapter: EditorTimelineAdapter<
      TimelineDocument,
      TimelineDocument["tracks"][number],
      TimelineDocument["clips"][number]
    > = {
      getItems: (document) => document.clips,
      getTracks: (document) => document.tracks,
    };

    expect(
      graphAdapter.getNodes({
        edges: [],
        nodes: [{ id: "node", type: "node", value: 1 }],
      })[0]?.value,
    ).toBe(1);
    expect(
      timelineAdapter.getItems({
        clips: [{ id: "clip", range: { end: 1, start: 0 }, trackId: "track", type: "clip" }],
        tracks: [{ id: "track", type: "track" }],
      })[0]?.range.end,
    ).toBe(1);
  });

  test("indexes nested entity documents by parent and order", () => {
    const document = createEditorEntityDocument([
      { id: "b", order: 2, parentId: null, type: "layer" },
      { id: "a", order: 1, parentId: null, type: "layer" },
      { id: "a.child", order: 1, parentId: "a", type: "layer" },
    ]);
    const indexes = createEditorEntityIndexes(document);

    expect(indexes.orderedRootIds).toEqual(["a", "b"]);
    expect(indexes.childrenByParentId.get(null)?.map((entity) => entity.id)).toEqual(["a", "b"]);
    expect(indexes.parentByChildId.get("a.child")).toBe("a");
  });

  test("indexes graph edges and timeline items", () => {
    const graph = createEditorGraphIndexes([
      { id: "edge", sourceId: "a", targetId: "b" },
      { id: "edge-2", sourceId: "b", targetId: "a" },
    ]);
    expect(graph.outgoingEdgesByNodeId.get("a")?.map((edge) => edge.id)).toEqual(["edge"]);
    expect(graph.incomingEdgesByNodeId.get("a")?.map((edge) => edge.id)).toEqual(["edge-2"]);

    const timeline = createEditorTimelineIndexes([
      { id: "late", range: { end: 20, start: 10 }, trackId: "track", type: "clip" },
      { id: "early", range: { end: 5, start: 0 }, trackId: "track", type: "clip" },
    ]);
    expect(timeline.trackItemsByTrackId.get("track")?.map((item) => item.id)).toEqual([
      "early",
      "late",
    ]);
  });

  test("does not mutate root id order while returning ordered roots", () => {
    const document = createEditorEntityDocument(
      [
        { id: "b", order: 2, parentId: null, type: "layer" },
        { id: "a", order: 1, parentId: null, type: "layer" },
      ],
      ["b", "a"],
    );
    const indexes = createEditorEntityIndexes(document);

    expect(document.rootIds).toEqual(["b", "a"]);
    expect(indexes.orderedRootIds).toEqual(["a", "b"]);
  });

  test("sorts existing child groups in deterministic numeric order", () => {
    const document = createEditorEntityDocument([
      { id: "parent", order: 1, parentId: null, type: "layer" },
      { id: "child-10", order: "10", parentId: "parent", type: "layer" },
      { id: "child-2", order: "2", parentId: "parent", type: "layer" },
    ]);
    const indexes = createEditorEntityIndexes(document);

    expect(indexes.childrenByParentId.get("parent")?.map((entity) => entity.id)).toEqual([
      "child-2",
      "child-10",
    ]);
  });

  test("keeps graph edge insertion order per node", () => {
    const graph = createEditorGraphIndexes([
      { id: "edge-1", sourceId: "a", targetId: "b" },
      { id: "edge-2", sourceId: "a", targetId: "c" },
      { id: "edge-3", sourceId: "d", targetId: "b" },
    ]);

    expect(graph.outgoingEdgesByNodeId.get("a")?.map((edge) => edge.id)).toEqual([
      "edge-1",
      "edge-2",
    ]);
    expect(graph.incomingEdgesByNodeId.get("b")?.map((edge) => edge.id)).toEqual([
      "edge-1",
      "edge-3",
    ]);
  });

  test("groups validation issues by entity id", () => {
    const grouped = groupEditorValidationIssuesByEntityId([
      { message: "Missing", path: "entities.node-a.label" },
      { message: "Invalid", path: "entities['node-b'].port" },
      { message: "Document", path: "title" },
    ]);

    expect(grouped.get("node-a")?.map((issue) => issue.message)).toEqual(["Missing"]);
    expect(grouped.get("node-b")?.map((issue) => issue.message)).toEqual(["Invalid"]);
  });
});
