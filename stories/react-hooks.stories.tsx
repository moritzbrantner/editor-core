import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import {
  applyEditorOperation,
  createEditorEntitySelection,
  createEditorOperationRuntime,
  createEditorViewportState,
  editorPixelToTime,
  editorPointToScreenPoint,
  editorTimeToPixel,
  panEditorViewport,
  screenPointToEditorPoint,
  type EditorSelection,
} from "@moenarch/editor-core";
import { useControllableEditorState, useEditorTreeState } from "@moenarch/editor-core/react";
import {
  projectEditorTree,
  windowEditorTreeItems,
  type EditorTreeAdapter,
  type EditorTreeItem,
} from "@moenarch/editor-core/tree";

type DemoDocument = {
  sections: readonly string[];
  title: string;
};

const demoTreeAdapter: EditorTreeAdapter<DemoDocument> = {
  getRoot(document) {
    return {
      children: document.sections.map((section, index) => ({
        id: `document.sections.${index}`,
        kind: "section",
        label: section,
        path: ["sections", index],
      })),
      expandedByDefault: true,
      id: "document",
      kind: "document",
      label: document.title,
    };
  },
};

function ReactHooksFixture({ initialTitle }: { initialTitle: string }) {
  const [title, setTitle] = useControllableEditorState({
    defaultValue: initialTitle,
  });
  const tree = useEditorTreeState({ expandedIds: ["document"] });
  const document = React.useMemo<DemoDocument>(
    () => ({
      sections: ["Outline", "Draft", "Review"],
      title,
    }),
    [title],
  );
  const projection = React.useMemo(
    () => projectEditorTree(document, demoTreeAdapter, { state: tree.state }),
    [document, tree.state],
  );

  return (
    <div className="grid max-w-3xl gap-4 rounded-lg border border-slate-200 bg-white p-4 text-slate-800 shadow-sm">
      <label className="grid gap-2 text-sm font-bold text-slate-600">
        Title
        <input
          className="min-h-11 rounded-md border border-slate-300 px-3 text-base font-semibold text-slate-900 outline-none focus:shadow-[inset_0_0_0_2px_#2563eb]"
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
      </label>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="m-0 mb-2 text-xs font-bold text-slate-500 uppercase">Projected tree</p>
        <div className="grid gap-1">
          {projection.items.map((item) => (
            <TreeItemRow item={item} key={item.node.id} onSelect={tree.select} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TreeItemRow({
  item,
  onSelect,
}: {
  item: EditorTreeItem;
  onSelect: (id: string | null) => void;
}) {
  return (
    <button
      aria-pressed={item.selected}
      className="min-h-9 cursor-pointer rounded-md border border-transparent px-3 text-left text-sm font-medium text-slate-700 aria-pressed:border-blue-300 aria-pressed:bg-blue-50 aria-pressed:text-blue-700"
      onClick={() => onSelect(item.node.id)}
      style={{ marginLeft: `${item.depth * 16}px` }}
      type="button"
    >
      {item.node.label}
    </button>
  );
}

function FoundationPrimitivesFixture() {
  const [editor, setEditor] = React.useState(() =>
    createEditorOperationRuntime<{ value: number }, EditorSelection>({
      initialDocument: { value: 0 },
      initialSelection: createEditorEntitySelection(["entity-1"]),
    }),
  );
  const [viewport, setViewport] = React.useState(() =>
    createEditorViewportState({ x: 10, y: 20, zoom: 2 }),
  );
  const largeTree = React.useMemo(
    () =>
      projectEditorTree(
        { sections: Array.from({ length: 100 }, (_, index) => `Section ${index}`), title: "Large" },
        demoTreeAdapter,
        { state: { expandedIds: ["document"], selectedId: "document.sections.5" } },
      ),
    [],
  );
  const windowedTree = windowEditorTreeItems(largeTree.items, { count: 6, start: 3 });
  const documentPoint = screenPointToEditorPoint({ x: 30, y: 40 }, viewport);
  const screenPoint = editorPointToScreenPoint(documentPoint, viewport);
  const timelinePixel = editorTimeToPixel(4, { end: 12, pixelsPerUnit: 16, start: 0 });
  const timelineTime = editorPixelToTime(timelinePixel, {
    end: 12,
    pixelsPerUnit: 16,
    start: 0,
  });

  return (
    <div className="grid max-w-4xl gap-4 rounded-lg border border-slate-200 bg-white p-4 text-slate-800 shadow-sm">
      <div className="grid gap-3 md:grid-cols-3">
        <button
          className="min-h-10 rounded-md border border-slate-300 bg-slate-50 px-3 text-sm font-bold"
          onClick={() =>
            setEditor((current) =>
              applyEditorOperation(current, {
                apply: (document) => ({ value: document.value + 1 }),
                id: "increment",
                selectionAfter: createEditorEntitySelection(["entity-1"]),
              }),
            )
          }
          type="button"
        >
          Value {editor.runtime.document.value}
        </button>
        <button
          className="min-h-10 rounded-md border border-slate-300 bg-slate-50 px-3 text-sm font-bold"
          onClick={() => setViewport((current) => panEditorViewport(current, { x: 5, y: -5 }))}
          type="button"
        >
          Viewport {viewport.x}, {viewport.y}
        </button>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-sm font-bold">
          Timeline {timelinePixel}px / {timelineTime}s
        </div>
      </div>

      <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="m-0 text-xs font-bold text-slate-500 uppercase">
          Tree rows {windowedTree.start}-{windowedTree.end} of {windowedTree.total}
        </p>
        {windowedTree.items.map((item) => (
          <TreeItemRow item={item} key={item.node.id} onSelect={() => {}} />
        ))}
      </div>

      <dl className="m-0 grid gap-2 text-sm md:grid-cols-3">
        <Metric label="Selection" value={editor.runtime.selection?.kind ?? "empty"} />
        <Metric label="Document point" value={`${documentPoint.x}, ${documentPoint.y}`} />
        <Metric label="Screen point" value={`${screenPoint.x}, ${screenPoint.y}`} />
      </dl>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
      <dt className="text-xs font-bold text-slate-500 uppercase">{label}</dt>
      <dd className="m-0 mt-1 font-bold text-slate-800">{value}</dd>
    </div>
  );
}

const meta = {
  args: {
    initialTitle: "Hook-driven document",
  },
  component: ReactHooksFixture,
  tags: ["test"],
  title: "React/Hooks",
} satisfies Meta<typeof ReactHooksFixture>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FoundationPrimitives: Story = {
  render: () => <FoundationPrimitivesFixture />,
};
