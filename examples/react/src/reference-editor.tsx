import * as React from "react";
import {
  applyEditorOperation,
  createEditorOperationRuntime,
  createEditorOperationRuntimeCommands,
  createEditorEntityDocument,
  createEditorEntitySelection,
  createEditorGraphIndexes,
  createEditorEntityIndexes,
  createEditorTimelineIndexes,
  fitEditorBoundsInViewport,
  formatEditorShortcutLabel,
  projectEditorTree,
  snapEditorValue,
  validateEditorGraphConnection,
  validateEditorTimelineRange,
  type EditorCommandDefinition,
  type EditorOperationRuntimeCommandId,
  type EditorSelection,
} from "@moenarch/editor-core";

type ReferenceTab = "layers" | "graph" | "workflow" | "timeline";

type LayerDocument = {
  layers: Record<
    string,
    {
      id: string;
      locked: boolean;
      order: number;
      parentId?: string | null;
      type: "group" | "layer";
      visible: boolean;
    }
  >;
  rootIds: readonly string[];
};

type GraphDocument = {
  edges: Array<{ id: string; sourceId: string; targetId: string }>;
  nodes: Record<string, { id: string; type: "node"; x: number; y: number }>;
};

type WorkflowDocument = {
  nodes: Record<string, { id: string; type: "start" | "action" | "end" }>;
  transitions: Array<{ id: string; sourceId: string; targetId: string }>;
};

type TimelineDocument = {
  clips: Record<
    string,
    { id: string; range: { end: number; start: number }; trackId: string; type: "clip" }
  >;
  playhead: number;
  tracks: Record<string, { id: string; type: "track" }>;
};

const initialLayerDocument: LayerDocument = {
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

const initialGraphDocument: GraphDocument = {
  edges: [{ id: "edge-ab", sourceId: "a", targetId: "b" }],
  nodes: {
    a: { id: "a", type: "node", x: 0, y: 0 },
    b: { id: "b", type: "node", x: 160, y: 0 },
  },
};

const initialWorkflowDocument: WorkflowDocument = {
  nodes: {
    action: { id: "action", type: "action" },
    end: { id: "end", type: "end" },
    start: { id: "start", type: "start" },
  },
  transitions: [{ id: "start-action", sourceId: "start", targetId: "action" }],
};

const initialTimelineDocument: TimelineDocument = {
  clips: {
    clip: { id: "clip", range: { end: 10, start: 0 }, trackId: "track", type: "clip" },
  },
  playhead: 0,
  tracks: { track: { id: "track", type: "track" } },
};

export function ReferenceEditor() {
  const [tab, setTab] = React.useState<ReferenceTab>("layers");
  const [layerEditor, setLayerEditor] = React.useState(() =>
    createEditorOperationRuntime<LayerDocument, EditorSelection>({
      initialDocument: initialLayerDocument,
      initialSelection: createEditorEntitySelection(["layerA"]),
    }),
  );
  const [graphEditor, setGraphEditor] = React.useState(() =>
    createEditorOperationRuntime<GraphDocument, EditorSelection>({
      initialDocument: initialGraphDocument,
      initialSelection: createEditorEntitySelection(["a"]),
      preflight({ operation }) {
        return operation.id === "connect-self"
          ? validateEditorGraphConnection({ sourceId: "a", targetId: "a" }, { path: "edges.next" })
          : [];
      },
    }),
  );
  const [workflowEditor, setWorkflowEditor] = React.useState(() =>
    createEditorOperationRuntime<WorkflowDocument, EditorSelection>({
      initialDocument: initialWorkflowDocument,
      initialSelection: createEditorEntitySelection(["action"]),
      preflight({ operation }) {
        return operation.id === "connect-end-start"
          ? validateEditorGraphConnection(
              { sourceId: "end", targetId: "start" },
              {
                canConnect: (connection) => connection.sourceId !== "end",
                path: "transitions.next",
              },
            )
          : [];
      },
    }),
  );
  const [timelineEditor, setTimelineEditor] = React.useState(() =>
    createEditorOperationRuntime<TimelineDocument, EditorSelection>({
      initialDocument: initialTimelineDocument,
      initialSelection: createEditorEntitySelection(["clip"]),
    }),
  );

  const tabs: Array<{ id: ReferenceTab; label: string }> = [
    { id: "layers", label: "Layers" },
    { id: "graph", label: "Graph" },
    { id: "workflow", label: "Workflow" },
    { id: "timeline", label: "Timeline" },
  ];

  return (
    <section
      aria-label="Reference editor"
      className="mx-auto grid max-w-[1180px] gap-4 rounded-lg border border-[#d8d1c6] bg-[#fffdf8] p-4 shadow-[0_24px_60px_rgba(47,36,24,0.1)]"
    >
      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((item) => (
          <button
            aria-selected={tab === item.id}
            className="min-h-10 cursor-pointer rounded-md border border-[#d8d1c6] bg-white px-3 text-sm font-bold text-slate-700 aria-selected:border-blue-500 aria-selected:bg-blue-50 aria-selected:text-blue-700"
            key={item.id}
            onClick={() => setTab(item.id)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "layers" ? <LayerReference editor={layerEditor} setEditor={setLayerEditor} /> : null}
      {tab === "graph" ? <GraphReference editor={graphEditor} setEditor={setGraphEditor} /> : null}
      {tab === "workflow" ? (
        <WorkflowReference editor={workflowEditor} setEditor={setWorkflowEditor} />
      ) : null}
      {tab === "timeline" ? (
        <TimelineReference editor={timelineEditor} setEditor={setTimelineEditor} />
      ) : null}
    </section>
  );
}

function LayerReference({
  editor,
  setEditor,
}: {
  editor: ReturnType<typeof createEditorOperationRuntime<LayerDocument, EditorSelection>>;
  setEditor: React.Dispatch<
    React.SetStateAction<
      ReturnType<typeof createEditorOperationRuntime<LayerDocument, EditorSelection>>
    >
  >;
}) {
  const document = editor.runtime.document;
  const entityDocument = React.useMemo(
    () => createEditorEntityDocument(Object.values(document.layers), document.rootIds),
    [document],
  );
  const indexes = React.useMemo(() => createEditorEntityIndexes(entityDocument), [entityDocument]);
  const tree = React.useMemo(
    () =>
      projectEditorTree(document, {
        getRoot(value) {
          return {
            children: value.rootIds.map((id) => ({ id, label: value.layers[id].id })),
            expandedByDefault: true,
            id: "layers",
            label: "Layers",
          };
        },
      }),
    [document],
  );

  const reorderLayer = React.useCallback(() => {
    setEditor((current) =>
      applyLayerReorder(current, Math.max(1, 4 - current.runtime.document.layers.layerA.order)),
    );
  }, [setEditor]);

  return (
    <ReferencePanel
      commands={createEditorOperationRuntimeCommands({ editor, setEditor })}
      issue={editor.issues[0]?.message}
      metrics={[
        ["Children", String(indexes.childrenByParentId.get("group")?.length ?? 0)],
        ["Tree rows", String(tree.items.length)],
        ["Undo", editor.canUndo ? "Ready" : "None"],
      ]}
      title="Layer list"
    >
      <button className={actionButtonClass} onClick={reorderLayer} type="button">
        Reorder layerA
      </button>
      <div className="grid gap-2">
        {indexes.childrenByParentId.get("group")?.map((layer) => (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2" key={layer.id}>
            <strong>{layer.id}</strong> order {layer.order} / {layer.visible ? "visible" : "hidden"}{" "}
            / {layer.locked ? "locked" : "editable"}
          </div>
        ))}
      </div>
    </ReferencePanel>
  );
}

function GraphReference({
  editor,
  setEditor,
}: {
  editor: ReturnType<typeof createEditorOperationRuntime<GraphDocument, EditorSelection>>;
  setEditor: React.Dispatch<
    React.SetStateAction<
      ReturnType<typeof createEditorOperationRuntime<GraphDocument, EditorSelection>>
    >
  >;
}) {
  const document = editor.runtime.document;
  const indexes = createEditorGraphIndexes(document.edges);
  const viewport = fitEditorBoundsInViewport(
    { height: 80, width: 260, x: document.nodes.a.x, y: document.nodes.a.y },
    { viewportSize: { height: 120, width: 360 } },
  );

  return (
    <ReferencePanel
      commands={createEditorOperationRuntimeCommands({ editor, setEditor })}
      issue={editor.issues[0]?.message}
      metrics={[
        ["Node A", `${document.nodes.a.x}, ${document.nodes.a.y}`],
        ["Outgoing", String(indexes.outgoingEdgesByNodeId.get("a")?.length ?? 0)],
        ["Zoom", viewport.zoom.toFixed(2)],
      ]}
      title="Node graph"
    >
      <button
        className={actionButtonClass}
        onClick={() => {
          setEditor((current) =>
            applyEditorGraphDrag(current, current.runtime.document.nodes.a.x + 20),
          );
        }}
        type="button"
      >
        Drag node A
      </button>
      <button
        className={actionButtonClass}
        onClick={() => {
          setEditor((current) =>
            applyEditorOperation(current, {
              apply: (value) => ({
                ...value,
                edges: [...value.edges, { id: "self", sourceId: "a", targetId: "a" }],
              }),
              id: "connect-self",
            }),
          );
        }}
        type="button"
      >
        Connect A to A
      </button>
    </ReferencePanel>
  );
}

function WorkflowReference({
  editor,
  setEditor,
}: {
  editor: ReturnType<typeof createEditorOperationRuntime<WorkflowDocument, EditorSelection>>;
  setEditor: React.Dispatch<
    React.SetStateAction<
      ReturnType<typeof createEditorOperationRuntime<WorkflowDocument, EditorSelection>>
    >
  >;
}) {
  const document = editor.runtime.document;
  const tree = projectEditorTree(document, {
    getRoot(value) {
      return {
        children: Object.values(value.nodes).map((node) => ({
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

  return (
    <ReferencePanel
      commands={createEditorOperationRuntimeCommands({ editor, setEditor })}
      issue={editor.issues[0]?.message}
      metrics={[
        ["Nodes", String(tree.items.length - 1)],
        ["Transitions", String(document.transitions.length)],
        ["Selected", editor.runtime.selection?.kind ?? "empty"],
      ]}
      title="Workflow"
    >
      <button
        className={actionButtonClass}
        onClick={() => {
          setEditor((current) =>
            applyEditorOperation(current, {
              apply: (value) => ({
                ...value,
                transitions: [
                  ...value.transitions,
                  { id: "end-start", sourceId: "end", targetId: "start" },
                ],
              }),
              id: "connect-end-start",
            }),
          );
        }}
        type="button"
      >
        Connect end to start
      </button>
      <div className="grid gap-1">
        {tree.items.map((item) => (
          <span className="rounded-md bg-slate-50 px-2 py-1 text-sm" key={item.node.id}>
            {item.node.kind ?? "root"} / {item.node.label}
          </span>
        ))}
      </div>
    </ReferencePanel>
  );
}

function TimelineReference({
  editor,
  setEditor,
}: {
  editor: ReturnType<typeof createEditorOperationRuntime<TimelineDocument, EditorSelection>>;
  setEditor: React.Dispatch<
    React.SetStateAction<
      ReturnType<typeof createEditorOperationRuntime<TimelineDocument, EditorSelection>>
    >
  >;
}) {
  const document = editor.runtime.document;
  const clip = document.clips.clip;
  const indexes = createEditorTimelineIndexes(Object.values(document.clips));
  const rangeIssues = validateEditorTimelineRange(clip.range);

  return (
    <ReferencePanel
      commands={createEditorOperationRuntimeCommands({ editor, setEditor })}
      issue={editor.issues[0]?.message ?? rangeIssues[0]?.message}
      metrics={[
        ["Clip range", `${clip.range.start}-${clip.range.end}`],
        ["Track clips", String(indexes.trackItemsByTrackId.get("track")?.length ?? 0)],
        ["Selection", editor.runtime.selection?.kind ?? "empty"],
      ]}
      title="Timeline"
    >
      <button
        className={actionButtonClass}
        onClick={() => {
          const snappedEnd = snapEditorValue(11.8, [{ kind: "frame", value: 12 }], 0.5).value;
          setEditor((current) =>
            applyEditorOperation(current, {
              apply: (value) => ({
                ...value,
                clips: {
                  ...value.clips,
                  clip: {
                    ...value.clips.clip,
                    range: { ...value.clips.clip.range, end: snappedEnd },
                  },
                },
              }),
              id: "trim-clip",
              selectionAfter: createEditorEntitySelection(["clip"]),
            }),
          );
        }}
        type="button"
      >
        Trim clip to snap
      </button>
    </ReferencePanel>
  );
}

function ReferencePanel({
  children,
  commands,
  issue,
  metrics,
  title,
}: {
  children: React.ReactNode;
  commands: readonly EditorCommandDefinition<EditorOperationRuntimeCommandId>[];
  issue?: string;
  metrics: ReadonlyArray<readonly [string, string]>;
  title: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="m-0 text-xl font-extrabold text-slate-800">{title}</h2>
        <div className="flex flex-wrap gap-2">{children}</div>
        <p className="m-0 min-h-6 text-sm font-bold text-red-600" role="status">
          {issue ?? "Valid"}
        </p>
      </section>
      <aside className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-2">
          {metrics.map(([label, value]) => (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2" key={label}>
              <dt className="text-xs font-bold text-slate-500 uppercase">{label}</dt>
              <dd className="m-0 mt-1 overflow-hidden text-sm font-extrabold text-ellipsis text-slate-800">
                {value}
              </dd>
            </div>
          ))}
        </div>
        <div className="grid gap-2">
          {commands.map((command) => (
            <button
              className={actionButtonClass}
              disabled={command.disabled}
              key={command.id}
              onClick={() => void command.run?.(buttonCommandEvent)}
              type="button"
            >
              {command.label}
              <span className="text-xs text-slate-500">
                {command.hotkeys?.[0] ? formatEditorShortcutLabel(command.hotkeys[0]) : ""}
              </span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

function applyLayerReorder(
  editor: ReturnType<typeof createEditorOperationRuntime<LayerDocument, EditorSelection>>,
  nextOrder: number,
) {
  return applyEditorOperation(
    editor,
    {
      apply: (document) => ({
        ...document,
        layers: {
          ...document.layers,
          layerA: { ...document.layers.layerA, order: nextOrder },
        },
      }),
      id: "reorder-layer",
      mergeKey: "reorder:group",
      selectionAfter: createEditorEntitySelection(["layerA"]),
    },
    { merge: true },
  );
}

function applyEditorGraphDrag(
  editor: ReturnType<typeof createEditorOperationRuntime<GraphDocument, EditorSelection>>,
  x: number,
) {
  return applyEditorOperation(
    editor,
    {
      apply: (document) => ({
        ...document,
        nodes: {
          ...document.nodes,
          a: { ...document.nodes.a, x },
        },
      }),
      id: "drag-node",
      mergeKey: "drag:a",
      selectionAfter: createEditorEntitySelection(["a"]),
    },
    { merge: true },
  );
}

const actionButtonClass =
  "flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-md border border-[#d8d1c6] bg-white px-3 py-2 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400 hover:bg-slate-50";

const buttonCommandEvent = {
  altKey: false,
  ctrlKey: false,
  key: "",
  metaKey: false,
  shiftKey: false,
  target: null,
};
