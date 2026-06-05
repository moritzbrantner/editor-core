import * as React from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import {
  createLocalStorageEditorStorage,
  createEditorRuntimeCommands,
  createStableEditorJsonEquals,
  decodeEditorSharePayload,
  downloadEditorJson,
  editorShareTokenFromUrl,
  editorShareUrl,
  encodeEditorSharePayload,
  formatEditorShortcutLabel,
  readEditorDocument,
  readEditorJsonFile,
  saveEditorStorage,
  loadEditorStorage,
  serializeEditorDocument,
  type EditorCommandDefinition,
  type EditorDocumentAdapter,
  type EditorDocumentMigrations,
  type EditorHotkeyEvent,
  type EditorRuntimeCommandId,
} from "@moritzbrantner/editor-core";
import {
  useEditorHotkeys,
  useEditorRuntime,
  useEditorTreeState,
} from "@moritzbrantner/editor-core/react";
import {
  projectEditorTree,
  type EditorTreeAdapter,
  type EditorTreeItem,
  type EditorTreeNode,
} from "@moritzbrantner/editor-core/tree";
import "./styles.css";

type Accent = "graphite" | "cobalt" | "moss" | "coral";

type ExampleDocument = {
  accent: Accent;
  body: string;
  title: string;
  updatedAt: string;
};

type CommandId = EditorRuntimeCommandId | "download" | "import" | "share" | "template";

const templateDocument: ExampleDocument = {
  accent: "cobalt",
  body: "Start drafting here. Change the title, adjust the accent, undo edits, and create a share URL from the current document state.",
  title: "Launch Notes",
  updatedAt: new Date("2026-01-15T10:00:00.000Z").toISOString(),
};

const fallbackDocument: ExampleDocument = {
  ...templateDocument,
  title: "Untitled Draft",
};

const accentLabels: Record<Accent, string> = {
  graphite: "Graphite",
  cobalt: "Cobalt",
  moss: "Moss",
  coral: "Coral",
};

const accentStyles: Record<
  Accent,
  {
    accent: string;
    focus: string;
    soft: string;
    swatch: string;
  }
> = {
  graphite: {
    accent: "text-slate-700",
    focus: "focus:shadow-[inset_0_0_0_2px_#334155]",
    soft: "hover:bg-slate-100 hover:border-slate-500",
    swatch: "bg-slate-700",
  },
  cobalt: {
    accent: "text-blue-600",
    focus: "focus:shadow-[inset_0_0_0_2px_#2563eb]",
    soft: "hover:bg-blue-50 hover:border-blue-500",
    swatch: "bg-blue-600",
  },
  moss: {
    accent: "text-emerald-700",
    focus: "focus:shadow-[inset_0_0_0_2px_#2f7d57]",
    soft: "hover:bg-emerald-50 hover:border-emerald-600",
    swatch: "bg-emerald-700",
  },
  coral: {
    accent: "text-red-600",
    focus: "focus:shadow-[inset_0_0_0_2px_#d84a3a]",
    soft: "hover:bg-red-50 hover:border-red-500",
    swatch: "bg-red-600",
  },
};

const exampleDocumentTreeAdapter: EditorTreeAdapter<ExampleDocument> = {
  getRoot(document) {
    return {
      children: [
        { id: "document.title", kind: "field", label: "Title", path: ["title"] },
        { id: "document.body", kind: "field", label: "Body", path: ["body"] },
        { id: "document.accent", kind: "field", label: "Accent", path: ["accent"] },
        { id: "document.updatedAt", kind: "field", label: "Updated At", path: ["updatedAt"] },
      ],
      expandedByDefault: true,
      id: "document",
      kind: "document",
      label: document.title || "Untitled Draft",
    };
  },
};

const exampleDocumentAdapter: EditorDocumentAdapter<ExampleDocument> = {
  format: "@moritzbrantner/editor-core/example-document",
  schemaVersion: 2,
  normalize(document) {
    return {
      accent: document.accent,
      body: document.body,
      title: document.title,
      updatedAt: document.updatedAt,
    };
  },
  read(input, path = "") {
    if (!isRecord(input)) {
      throw new Error(`${path || "document"} must be an object`);
    }

    const accent = isAccent(input.accent) ? input.accent : "cobalt";
    return {
      accent,
      body: typeof input.body === "string" ? input.body : "",
      title: typeof input.title === "string" ? input.title : "Untitled Draft",
      updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : new Date().toISOString(),
    };
  },
  validate(document) {
    return document.title.trim().length === 0
      ? [{ path: "title", message: "Title is required." }]
      : [];
  },
};

const exampleDocumentMigrations: EditorDocumentMigrations<ExampleDocument> = {
  1: (input) => ({
    ...input,
    schemaVersion: 2,
    document: {
      ...(isRecord(input.document) ? input.document : {}),
      updatedAt: new Date().toISOString(),
    },
  }),
};

const exampleStorage = createLocalStorageEditorStorage<ExampleDocument>({
  key: "@moritzbrantner/editor-core/react-example",
  parse(input) {
    return readEditorDocument(input, exampleDocumentAdapter, {
      migrations: exampleDocumentMigrations,
    });
  },
  serialize(document) {
    return serializeEditorDocument(document, exampleDocumentAdapter);
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5,
    },
  },
});

const equalsDocument = createStableEditorJsonEquals<ExampleDocument>();
const historyOptions = { equals: equalsDocument, limit: 30 };

function App() {
  const workspaceRef = React.useRef<HTMLDivElement>(null);
  const importFileInputRef = React.useRef<HTMLInputElement>(null);
  const tree = useEditorTreeState({ expandedIds: ["document"] });
  const templateQuery = useQuery({
    queryFn: loadTemplateDocument,
    queryKey: ["react-example", "template-document"],
  });
  const runtime = useEditorRuntime<ExampleDocument, string>({
    history: historyOptions,
    initialDocument: fallbackDocument,
    validate: (document) => exampleDocumentAdapter.validate?.(document) ?? [],
  });
  const [notice, setNotice] = React.useState("Ready");
  const { commit, reset, setState, state: editor } = runtime;
  const document = editor.document;
  const tone = accentStyles[document.accent];
  const template = templateQuery.data ?? templateDocument;
  const validationNotice = editor.issues[0]?.message;
  const treeProjection = React.useMemo(
    () => projectEditorTree(document, exampleDocumentTreeAdapter, { state: tree.state }),
    [document, tree.state],
  );
  const selectedTreeNode = treeProjection.state.selectedId
    ? (treeProjection.nodesById.get(treeProjection.state.selectedId) ?? null)
    : null;

  const patchDocument = React.useCallback(
    (patch: Partial<ExampleDocument>) => {
      commit(({ document }) => ({
        ...document,
        ...patch,
        updatedAt: new Date().toISOString(),
      }));
    },
    [commit],
  );

  const loadTemplate = React.useCallback(async () => {
    const result = await templateQuery.refetch();
    const nextDocument = result.data ?? template;
    reset(nextDocument, { markSaved: true });
    setNotice("Template loaded");
  }, [reset, template, templateQuery]);

  const shareDocument = React.useCallback(async () => {
    const token = await encodeEditorSharePayload(document);
    const url = editorShareUrl(window.location.origin, window.location.pathname, token);
    await navigator.clipboard?.writeText(url);
    setNotice(navigator.clipboard ? "Share URL copied" : url);
  }, [document]);

  const saveRuntimeDocument = React.useCallback(async (runtime: { document: ExampleDocument }) => {
    await saveEditorStorage(exampleStorage, runtime.document);
    setNotice("Saved locally");
  }, []);

  const downloadDocument = React.useCallback(() => {
    downloadEditorJson(serializeEditorDocument(document, exampleDocumentAdapter), {
      filename: document.title || "editor-document",
    });
    setNotice("JSON downloaded");
  }, [document]);

  const importDocumentFile = React.useCallback(
    async (file: File) => {
      try {
        const imported = await readEditorJsonFile(file, {
          parse(input) {
            return readEditorDocument(input, exampleDocumentAdapter, {
              migrations: exampleDocumentMigrations,
            });
          },
        });
        reset(imported, { markSaved: true });
        setNotice("JSON imported");
      } catch {
        setNotice("JSON import failed");
      }
    },
    [reset],
  );

  const runtimeCommands = React.useMemo(
    () =>
      createEditorRuntimeCommands({
        getResetDocument: () => template,
        onSave: saveRuntimeDocument,
        runtime: editor,
        setRuntime: setState,
      }),
    [editor, saveRuntimeDocument, setState, template],
  );

  const commands = React.useMemo<readonly EditorCommandDefinition<CommandId>[]>(
    () => [
      ...runtimeCommands,
      {
        hotkeys: ["Mod+Enter"],
        id: "template",
        label: "Template",
        run: loadTemplate,
      },
      {
        hotkeys: ["Mod+O"],
        id: "import",
        label: "Import JSON",
        run: () => importFileInputRef.current?.click(),
      },
      {
        hotkeys: ["Mod+Shift+S"],
        id: "download",
        label: "Download JSON",
        run: downloadDocument,
      },
      {
        hotkeys: ["Mod+S"],
        id: "share",
        label: "Share",
        run: shareDocument,
      },
    ],
    [downloadDocument, loadTemplate, runtimeCommands, shareDocument],
  );

  useEditorHotkeys({
    allowEditableTargets: true,
    commands,
    scopeRef: workspaceRef,
  });

  React.useEffect(() => {
    const token = editorShareTokenFromUrl(window.location.href);
    if (!token) {
      return;
    }

    let mounted = true;
    void decodeEditorSharePayload<ExampleDocument>(token)
      .then((sharedDocument) => {
        if (!mounted) {
          return;
        }
        reset(sharedDocument, { markSaved: true });
        setNotice("Loaded shared document");
      })
      .catch(() => {
        if (mounted) {
          setNotice("Share URL could not be opened");
        }
      });

    return () => {
      mounted = false;
    };
  }, [reset]);

  React.useEffect(() => {
    if (editorShareTokenFromUrl(window.location.href)) {
      return;
    }

    let mounted = true;
    void loadEditorStorage(exampleStorage, fallbackDocument).then((storedDocument) => {
      if (!mounted || equalsDocument(storedDocument, fallbackDocument)) {
        return;
      }
      reset(storedDocument, { markSaved: true });
      setNotice("Loaded local draft");
    });

    return () => {
      mounted = false;
    };
  }, [reset]);

  return (
    <main
      className="min-h-screen bg-[#f4f0e8] bg-[linear-gradient(180deg,rgba(255,255,255,0.64),rgba(255,255,255,0)_38%)] p-4 text-slate-800 sm:p-7"
      ref={workspaceRef}
    >
      <header className="mx-auto mb-5 grid max-w-[1180px] items-start gap-5 md:flex md:items-end md:justify-between">
        <div>
          <p className={`mb-1.5 text-xs font-bold uppercase ${tone.accent}`}>
            @moritzbrantner/editor-core
          </p>
          <h1 className="m-0 text-[clamp(2rem,5vw,4.8rem)] leading-[0.95] font-extrabold">
            React editor example
          </h1>
        </div>
        <p
          className="m-0 min-w-45 rounded-lg border border-[#d8d1c6] bg-[#fffdf8]/75 px-3 py-2.5 text-center text-slate-500"
          role="status"
        >
          {templateQuery.isFetching ? "Refreshing template" : (validationNotice ?? notice)}
        </p>
      </header>

      <section
        aria-label="Editor workspace"
        className="mx-auto grid max-w-[1180px] items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_340px]"
      >
        <div className="grid overflow-hidden rounded-lg border border-[#d8d1c6] bg-[#fffdf8] shadow-[0_24px_60px_rgba(47,36,24,0.1)] [grid-template-rows:auto_minmax(360px,1fr)] max-sm:[grid-template-rows:auto_minmax(300px,1fr)]">
          <input
            aria-label="Document title"
            className={`w-full border-0 border-b border-[#d8d1c6] bg-transparent px-5 py-5 text-[clamp(2rem,6vw,5.6rem)] leading-[0.96] font-extrabold text-slate-800 outline-none sm:px-7 sm:pt-7 sm:pb-5 ${tone.focus}`}
            onChange={(event) => patchDocument({ title: event.target.value })}
            value={document.title}
          />
          <textarea
            aria-label="Document body"
            className={`min-h-[300px] w-full resize-y border-0 bg-transparent px-5 py-5 text-[1.08rem] leading-7 text-slate-700 outline-none sm:min-h-[360px] sm:px-7 sm:py-6 ${tone.focus}`}
            onChange={(event) => patchDocument({ body: event.target.value })}
            value={document.body}
          />
        </div>

        <aside
          aria-label="Document controls"
          className="flex flex-col gap-4 rounded-lg border border-[#d8d1c6] bg-[#fffdf8] p-4 shadow-[0_24px_60px_rgba(47,36,24,0.1)]"
        >
          <div aria-label="Commands" className="grid gap-2.5">
            <input
              accept="application/json,.json"
              aria-label="Import document JSON file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) {
                  void importDocumentFile(file);
                }
              }}
              ref={importFileInputRef}
              type="file"
            />
            {commands.map((command) => (
              <button
                className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border border-[#d8d1c6] bg-white px-3 py-2.5 text-slate-800 disabled:cursor-not-allowed disabled:text-slate-400 ${tone.soft}`}
                disabled={command.disabled}
                key={command.id}
                onClick={() => void command.run?.(buttonCommandEvent)}
                title={command.hotkeys?.map(formatEditorShortcutLabel).join(", ")}
                type="button"
              >
                <span>{command.label}</span>
                <kbd className="min-w-19 rounded-md border border-slate-300 bg-slate-50 px-1.5 py-1 text-center text-xs text-slate-600">
                  {command.hotkeys?.[0] ? formatEditorShortcutLabel(command.hotkeys[0]) : ""}
                </kbd>
              </button>
            ))}
          </div>

          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-2.5 text-sm font-bold text-slate-500 uppercase">Accent</legend>
            <div className="grid grid-cols-2 gap-2.5">
              {(Object.keys(accentLabels) as Accent[]).map((accent) => (
                <button
                  aria-pressed={document.accent === accent}
                  className={`flex min-h-20 cursor-pointer items-end rounded-lg border border-[#d8d1c6] p-2.5 text-white outline-offset-2 aria-pressed:outline-3 ${accentStyles[accent].swatch}`}
                  key={accent}
                  onClick={() => patchDocument({ accent })}
                  title={accentLabels[accent]}
                  type="button"
                >
                  <span className="text-sm font-extrabold">{accentLabels[accent]}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <dl className="m-0 grid grid-cols-2 gap-2.5">
            <Metric label="Words" tone={tone.accent} value={countWords(document.body)} />
            <Metric label="State" tone={tone.accent} value={editor.status} />
            <Metric label="Undo" tone={tone.accent} value={editor.canUndo ? "Ready" : "None"} />
            <Metric label="Redo" tone={tone.accent} value={editor.canRedo ? "Ready" : "None"} />
            <Metric
              label="Template"
              tone={tone.accent}
              value={templateQuery.isSuccess ? "Cached" : "Loading"}
            />
            <Metric
              label="Version"
              tone={tone.accent}
              value={exampleDocumentAdapter.schemaVersion}
            />
          </dl>

          <EditingTreePanel
            items={treeProjection.items}
            onSelect={tree.select}
            onToggle={tree.toggle}
            selectedNode={selectedTreeNode}
            tone={tone.accent}
          />
        </aside>
      </section>
    </main>
  );
}

function EditingTreePanel({
  items,
  onSelect,
  onToggle,
  selectedNode,
  tone,
}: {
  items: readonly EditorTreeItem[];
  onSelect: (id: string | null) => void;
  onToggle: (id: string) => void;
  selectedNode: EditorTreeNode | null;
  tone: string;
}) {
  return (
    <section aria-label="Editing tree" className="rounded-lg border border-[#d8d1c6] bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="m-0 text-sm font-bold text-slate-500 uppercase">Editing tree</h2>
        <span className={`text-xs font-bold ${tone}`}>{items.length}</span>
      </div>
      <div className="grid gap-1">
        {items.map((item) => (
          <TreeRow item={item} key={item.node.id} onSelect={onSelect} onToggle={onToggle} />
        ))}
      </div>
      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2.5">
        <p className="m-0 text-xs font-bold text-slate-500 uppercase">Selected</p>
        <p className="mt-1 mb-0 overflow-hidden text-sm font-bold text-ellipsis text-slate-800">
          {selectedNode?.label ?? "None"}
        </p>
        <p className="mt-1 mb-0 overflow-hidden text-xs text-ellipsis text-slate-500">
          {selectedNode ? describeTreeNode(selectedNode) : "No tree node selected"}
        </p>
      </div>
    </section>
  );
}

function TreeRow({
  item,
  onSelect,
  onToggle,
}: {
  item: EditorTreeItem;
  onSelect: (id: string | null) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-1">
      <button
        aria-label={`${item.expanded ? "Collapse" : "Expand"} ${item.node.label}`}
        className="grid size-7 cursor-pointer place-items-center rounded-md border border-slate-200 bg-slate-50 text-sm font-bold text-slate-600 disabled:cursor-default disabled:opacity-0"
        disabled={!item.hasChildren}
        onClick={() => onToggle(item.node.id)}
        type="button"
      >
        {item.expanded ? "-" : "+"}
      </button>
      <button
        aria-pressed={item.selected}
        className="min-h-8 cursor-pointer overflow-hidden rounded-md border border-transparent px-2 py-1.5 text-left text-sm text-ellipsis text-slate-700 aria-pressed:border-blue-300 aria-pressed:bg-blue-50 aria-pressed:text-blue-700 disabled:cursor-default disabled:text-slate-400"
        disabled={item.node.selectable === false}
        onClick={() => onSelect(item.node.id)}
        style={{ paddingLeft: `${item.depth * 14 + 8}px` }}
        title={item.node.label}
        type="button"
      >
        {item.node.label}
      </button>
    </div>
  );
}

function Metric({ label, tone, value }: { label: string; tone: string; value: React.ReactNode }) {
  return (
    <div className="min-h-20 rounded-lg border border-[#d8d1c6] bg-white p-3">
      <dt className="text-xs font-bold text-slate-500 uppercase">{label}</dt>
      <dd className={`mt-2 overflow-hidden text-xl font-extrabold text-ellipsis ${tone}`}>
        {value}
      </dd>
    </div>
  );
}

function countWords(value: string) {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function describeTreeNode(node: EditorTreeNode) {
  const kind = node.kind ?? "node";
  const path = node.path?.join(".") ?? node.id;
  return `${kind} / ${path} / ${node.id}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAccent(value: unknown): value is Accent {
  return typeof value === "string" && value in accentLabels;
}

async function loadTemplateDocument(): Promise<ExampleDocument> {
  await new Promise((resolve) => setTimeout(resolve, 120));
  return {
    ...templateDocument,
    updatedAt: new Date().toISOString(),
  };
}

const buttonCommandEvent: EditorHotkeyEvent = {
  altKey: false,
  ctrlKey: false,
  key: "",
  metaKey: false,
  shiftKey: false,
  target: null,
};

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
