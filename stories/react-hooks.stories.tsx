import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { useControllableEditorState, useEditorTreeState } from "@moritzbrantner/editor-core/react";
import {
  projectEditorTree,
  type EditorTreeAdapter,
  type EditorTreeItem,
} from "@moritzbrantner/editor-core/tree";

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
