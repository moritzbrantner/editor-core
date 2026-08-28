import * as React from "react";
import {
  applyEditorOperation,
  createEditorEntityDocument,
  createEditorEntityIndexes,
  createEditorEntitySelection,
  createEditorOperationRuntime,
  createEditorOperationRuntimeCommands,
  projectEditorTree,
  snapEditorValue,
  type EditorSelection,
} from "@moenarch/editor-core";

type ReferenceItem = {
  id: string;
  label: string;
  order: number;
  parentId?: string | null;
  type: "group" | "item";
  x: number;
};

type ReferenceDocument = {
  items: Record<string, ReferenceItem>;
  rootIds: readonly string[];
};

const initialDocument: ReferenceDocument = {
  items: {
    group: { id: "group", label: "Group", order: 0, type: "group", x: 0 },
    itemA: {
      id: "itemA",
      label: "Item A",
      order: 1,
      parentId: "group",
      type: "item",
      x: 0,
    },
    itemB: {
      id: "itemB",
      label: "Item B",
      order: 2,
      parentId: "group",
      type: "item",
      x: 80,
    },
  },
  rootIds: ["group"],
};

export function ReferenceEditor() {
  const [editor, setEditor] = React.useState(() =>
    createEditorOperationRuntime<ReferenceDocument, EditorSelection>({
      initialDocument,
      initialSelection: createEditorEntitySelection(["itemA"]),
    }),
  );

  const document = editor.runtime.document;
  const entityDocument = React.useMemo(
    () => createEditorEntityDocument(Object.values(document.items), document.rootIds),
    [document],
  );
  const indexes = React.useMemo(() => createEditorEntityIndexes(entityDocument), [entityDocument]);
  const tree = React.useMemo(
    () =>
      projectEditorTree(document, {
        getRoot(value) {
          return {
            children: value.rootIds.map((id) => ({
              id,
              label: value.items[id].label,
            })),
            expandedByDefault: true,
            id: "document",
            label: "Reference document",
          };
        },
      }),
    [document],
  );
  const commands = createEditorOperationRuntimeCommands({ editor, setEditor });

  const moveItem = React.useCallback(() => {
    setEditor((current) => {
      const nextX = snapEditorValue(
        current.runtime.document.items.itemA.x + 37,
        [{ id: "guide-40", value: 40 }, { id: "guide-80", value: 80 }],
        5,
      ).value;
      return applyEditorOperation(
        current,
        {
          apply: (value) => ({
            ...value,
            items: {
              ...value.items,
              itemA: { ...value.items.itemA, x: nextX },
            },
          }),
          id: "move-item",
          label: "Move item",
          mergeKey: "move:itemA",
          selectionAfter: createEditorEntitySelection(["itemA"]),
        },
        { merge: true },
      );
    });
  }, []);

  const reorderItems = React.useCallback(() => {
    setEditor((current) =>
      applyEditorOperation(current, {
        apply: (value) => ({
          ...value,
          items: {
            ...value.items,
            itemA: { ...value.items.itemA, order: 2 },
            itemB: { ...value.items.itemB, order: 1 },
          },
        }),
        id: "reorder-items",
        label: "Reorder items",
        selectionAfter: createEditorEntitySelection(["itemA"]),
      }),
    );
  }, []);

  return (
    <section
      aria-label="Reference editor"
      className="mx-auto grid max-w-[900px] gap-4 rounded-lg border border-[#d8d1c6] bg-[#fffdf8] p-4 shadow-[0_24px_60px_rgba(47,36,24,0.1)]"
    >
      <div>
        <h2 className="text-lg font-bold text-slate-900">Generic editor kernel</h2>
        <p className="text-sm text-slate-600">
          Domain objects stay local; Editor Core supplies history, selection, indexing, tree projection,
          commands, and generic snapping.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={actionButtonClass} onClick={moveItem} type="button">
          Move item A
        </button>
        <button className={actionButtonClass} onClick={reorderItems} type="button">
          Reorder items
        </button>
        {commands.map((command) => (
          <button
            className={actionButtonClass}
            disabled={command.disabled}
            key={command.id}
            onClick={() => command.run?.(new KeyboardEvent("keydown"))}
            type="button"
          >
            {command.label}
          </button>
        ))}
      </div>

      <dl className="grid gap-2 sm:grid-cols-3">
        <Metric label="Item A position" value={String(document.items.itemA.x)} />
        <Metric
          label="Children order"
          value={
            indexes.childrenByParentId.get("group")?.map((item) => item.id).join(" → ") ?? ""
          }
        />
        <Metric label="Projected rows" value={String(tree.items.length)} />
      </dl>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#e3ddd2] bg-white p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 font-mono text-sm text-slate-900">{value}</dd>
    </div>
  );
}

const actionButtonClass =
  "min-h-10 cursor-pointer rounded-md border border-[#cfc6b8] bg-white px-3 text-sm font-semibold text-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
