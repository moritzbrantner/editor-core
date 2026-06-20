import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = await mkdtemp(join(tmpdir(), "editor-core-smoke-"));
const node = process.execPath;
const compatNode = process.env.EDITOR_CORE_COMPAT_NODE_BIN ?? node;
const npmSmokeEnv = { ...process.env, npm_config_dry_run: "false" };

try {
  const { stdout } = await execFileAsync("npm", ["pack", "--pack-destination", tempDir], {
    cwd: rootDir,
    env: npmSmokeEnv,
  });
  const tarball = join(tempDir, stdout.trim().split("\n").at(-1));

  await smokeHeadlessConsumer(tarball);
  await smokeReactSubpath(tarball);
  await smokeBrowserBundle(tarball);
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

async function smokeHeadlessConsumer(tarball) {
  const consumerDir = join(tempDir, "headless-consumer");
  await mkdir(consumerDir, { recursive: true });
  await writeJson(join(consumerDir, "package.json"), {
    dependencies: {
      "@moenarch/editor-core": `file:${tarball}`,
    },
    private: true,
    type: "module",
  });
  await execFileAsync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: consumerDir,
    env: npmSmokeEnv,
  });

  assert.equal(existsSync(join(consumerDir, "node_modules", "react")), false);

  await writeFile(
    join(consumerDir, "node-esm.mjs"),
    `
      import * as core from "@moenarch/editor-core";
      import { createEditorSnapshotHistory } from "@moenarch/editor-core/history";
      import { stableEditorJsonStringify } from "@moenarch/editor-core/json";
      import { serializeEditorDocument } from "@moenarch/editor-core/serialization";
      import { checkEditorDocumentAdapter } from "@moenarch/editor-core/testing";
      import { matchesEditorHotkey } from "@moenarch/editor-core/hotkeys";
      import { projectEditorTree } from "@moenarch/editor-core/tree";
      import { createEditorAspect } from "@moenarch/editor-core/aspects";
      import { editorShareUrl } from "@moenarch/editor-core/share";
      import { ensureEditorJsonFilename } from "@moenarch/editor-core/browser";
      import { createEditorSnapshotHistoryCommands } from "@moenarch/editor-core/commands";
      import { validateEditorGraphConnection } from "@moenarch/editor-core/constraints";
      import { createEditorEntityDocument, createUniqueEditorId } from "@moenarch/editor-core/entities";
      import { createEditorEntityIndexes } from "@moenarch/editor-core/indexes";
      import { createEditorInteractionSession } from "@moenarch/editor-core/interaction";
      import { createEditorOperationRuntime } from "@moenarch/editor-core/operations";
      import { createEditorEntitySelection } from "@moenarch/editor-core/selection";
      import { createEditorViewportState } from "@moenarch/editor-core/viewport";
      import { createEditorCollaborationState } from "@moenarch/editor-core/collaboration";
      import { applyEditorPatch, diffEditorJson } from "@moenarch/editor-core/patches";
      import { createEditorPluginRegistry } from "@moenarch/editor-core/plugins";
      import { applyEditorRemoteOperations } from "@moenarch/editor-core/sync";
      import {
        EditorPersistenceConflictError,
        saveEditorRuntimeConflictPersistence,
      } from "@moenarch/editor-core/persistence";

      if ("useEditorHotkeys" in core || "useEditorTreeState" in core) {
        throw new Error("React hooks leaked from the root entrypoint");
      }
      if (
        typeof core.createEditorCollaborationState !== "function" ||
        typeof core.createUniqueEditorId !== "function" ||
        typeof core.diffEditorJson !== "function" ||
        typeof core.createEditorPluginRegistry !== "function" ||
        typeof core.saveEditorRuntimeConflictPersistence !== "function"
      ) {
        throw new Error("New headless helpers are missing from the root entrypoint");
      }
      if ("applyEditorRemoteOperations" in core) {
        throw new Error("Sync helpers leaked from the root entrypoint");
      }

      const history = createEditorSnapshotHistory({ title: "Draft" });
      const tree = projectEditorTree({ title: "Draft" }, {
        getRoot(document) {
          return { id: "document", label: document.title };
        },
      });
      const adapter = {
        format: "@smoke/document",
        schemaVersion: 1,
        normalize: (document) => document,
        read: (input) => input,
      };

      stableEditorJsonStringify({ b: 2, a: 1 });
      serializeEditorDocument({ title: "Draft" }, adapter, { exportedAt: false });
      const adapterCheck = checkEditorDocumentAdapter(adapter, {
        expected: { title: "Draft" },
        id: "smoke",
        input: { title: "Draft" },
        roundtrip: true,
      });
      matchesEditorHotkey({ altKey: false, ctrlKey: true, key: "z", metaKey: false, shiftKey: false, target: null }, "Mod+Z");
      createEditorAspect({ id: "title", derive: ({ document }) => document.title });
      editorShareUrl("https://example.com", "/editor", "plain.token");
      ensureEditorJsonFilename("document");
      createEditorSnapshotHistoryCommands({
        getResetDocument: () => history.present,
        history,
        setHistory() {},
      });
      const entityDocument = createEditorEntityDocument([{ id: "node", type: "node" }]);
      const uniqueEntityId = createUniqueEditorId("node", []);
      const indexes = createEditorEntityIndexes(entityDocument);
      const interaction = createEditorInteractionSession(history.present);
      const operationRuntime = createEditorOperationRuntime({ initialDocument: history.present });
      const selection = createEditorEntitySelection(["node"]);
      const viewport = createEditorViewportState({ zoom: 2 });
      const graphIssues = validateEditorGraphConnection({ sourceId: "node", targetId: "node" });
      const collaboration = createEditorCollaborationState({ clientId: "client-a" });
      const patch = diffEditorJson({ title: "Draft" }, { title: "Published" });
      const patched = applyEditorPatch({ title: "Draft" }, patch);
      const registry = createEditorPluginRegistry([{ id: "smoke-plugin" }]);
      const remoteApplied = applyEditorRemoteOperations(
        history.present,
        collaboration,
        [{ clientId: "client-b", id: "remote-op", operation: { title: "Remote" } }],
        {
          decode: (envelope) => envelope.operation,
          apply: (_state, operation) => operation,
        },
      );
      const dirtyRuntime = core.commitEditorRuntime(
        core.createEditorRuntime({ initialDocument: { title: "Draft" } }),
        { title: "Saved" },
      );
      let savedRevisionToken;
      const conflictStorage = {
        load: () => ({ document: { title: "Draft" }, revisionToken: "server-1" }),
        save(value) {
          savedRevisionToken = value.revisionToken;
          return { document: value.document, revisionToken: "server-2" };
        },
      };
      const conflictSaved = await saveEditorRuntimeConflictPersistence(dirtyRuntime, conflictStorage, {
        revisionToken: "server-1",
      });
      const conflict = new EditorPersistenceConflictError("stale revision", {
        local: { document: dirtyRuntime.document, revisionToken: "server-1" },
      });

      if (tree.root.id !== "document") {
        throw new Error("Tree projection failed");
      }
      if (!adapterCheck.ok || uniqueEntityId !== "node" || !indexes.entitiesById.has("node") || interaction.state.kind !== "idle" || operationRuntime.canUndo || selection.kind !== "entity" || viewport.zoom !== 2 || graphIssues.length === 0) {
        throw new Error("New foundation subpaths failed");
      }
      if (collaboration.clientId !== "client-a" || patched.title !== "Published" || registry.plugins.length !== 1 || remoteApplied.state.title !== "Remote" || !conflictSaved.saved || conflictSaved.persistence.revisionToken !== "server-2" || savedRevisionToken !== "server-1" || conflict.name !== "EditorPersistenceConflictError") {
        throw new Error("New release subpaths failed");
      }
    `,
  );
  await execFileAsync(node, [join(consumerDir, "node-esm.mjs")], { cwd: consumerDir });

  await writeFile(
    join(consumerDir, "node-compat.mjs"),
    `
      import { decodeEditorSharePayload, encodeEditorSharePayload } from "@moenarch/editor-core/share";

      delete globalThis.atob;
      delete globalThis.btoa;

      const token = await encodeEditorSharePayload({ value: "compat" });
      const decoded = await decodeEditorSharePayload(token);
      if (decoded.value !== "compat") {
        throw new Error("Share token compatibility round-trip failed");
      }
    `,
  );
  await execFileAsync(compatNode, [join(consumerDir, "node-compat.mjs")], { cwd: consumerDir });

  await writeFile(
    join(consumerDir, "types.ts"),
    `
      import {
        createEditorSnapshotHistory,
        createEditorOperationRuntime,
        type EditorSnapshotHistory,
        type EditorGraphAdapter,
      } from "@moenarch/editor-core";
      import type {
        EditorCollaborationState,
        EditorRemoteOperation,
      } from "@moenarch/editor-core/collaboration";
      import type { EditorPatch } from "@moenarch/editor-core/patches";
      import type { EditorPlugin } from "@moenarch/editor-core/plugins";
      import type { EditorConflictStorageAdapter } from "@moenarch/editor-core/persistence";
      import type { EditorRemoteApplyAdapter } from "@moenarch/editor-core/sync";
      import type { EditorDocumentAdapterCheckCase } from "@moenarch/editor-core/testing";
      import type { EditorTreeAdapter } from "@moenarch/editor-core/tree";

      type Document = { title: string };
      const history: EditorSnapshotHistory<Document> = createEditorSnapshotHistory({ title: "Draft" });
      const adapter: EditorTreeAdapter<Document> = {
        getRoot(document) {
          return { id: "document", label: document.title };
        },
      };
      const runtime = createEditorOperationRuntime({ initialDocument: { title: "Draft" } });
      const graphAdapter: EditorGraphAdapter<
        { nodes: Array<{ id: string; type: "node" }>; edges: Array<{ id: string; sourceId: string; targetId: string }> },
        { id: string; type: "node" },
        { id: string; sourceId: string; targetId: string }
      > = {
        getEdges: (document) => document.edges,
        getNodes: (document) => document.nodes,
      };
      const adapterCase: EditorDocumentAdapterCheckCase<Document> = {
        expected: { title: "Draft" },
        id: "document",
        input: { title: "Draft" },
      };
      const collaborationState: EditorCollaborationState<string> = {
        clientId: "client-a",
        presence: {},
        revision: null,
        seenOperationIds: [],
      };
      const remoteOperation: EditorRemoteOperation<{ type: "rename" }> = {
        clientId: "client-b",
        id: "op-1",
        operation: { type: "rename" },
      };
      const patch: EditorPatch = [{ op: "replace", path: ["title"], value: "Published" }];
      const plugin: EditorPlugin<Document, string> = { id: "metadata" };
      const conflictStorage: EditorConflictStorageAdapter<Document> = {
        load: () => ({ document: { title: "Draft" }, revisionToken: "server-1" }),
        save: (value) => value,
      };
      const remoteAdapter: EditorRemoteApplyAdapter<Document, { title: string }, { title: string }> = {
        decode: (envelope) => envelope.operation,
        apply: (_state, operation) => operation,
      };

      void history;
      void adapter;
      void runtime;
      void graphAdapter;
      void adapterCase;
      void collaborationState;
      void remoteOperation;
      void patch;
      void plugin;
      void conflictStorage;
      void remoteAdapter;
    `,
  );
  await writeJson(join(consumerDir, "tsconfig.json"), {
    compilerOptions: {
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      target: "ES2022",
    },
    include: ["types.ts"],
  });
  await execFileAsync(
    node,
    [join(rootDir, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"],
    {
      cwd: consumerDir,
    },
  );
}

async function smokeReactSubpath(tarball) {
  const consumerDir = join(tempDir, "react-consumer");
  await mkdir(consumerDir, { recursive: true });
  await writeJson(join(consumerDir, "package.json"), {
    dependencies: {
      "@moenarch/editor-core": `file:${tarball}`,
    },
    private: true,
    type: "module",
  });
  await execFileAsync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: consumerDir,
    env: npmSmokeEnv,
  });
  await mkdir(join(consumerDir, "node_modules", "react"), { recursive: true });
  await writeJson(join(consumerDir, "node_modules", "react", "package.json"), {
    exports: "./index.js",
    name: "react",
    type: "module",
    version: "0.0.0-smoke",
  });
  await writeFile(
    join(consumerDir, "node_modules", "react", "index.js"),
    `
      export function useCallback(value) { return value; }
      export function useEffect() {}
      export function useState(value) { return [typeof value === "function" ? value() : value, () => {}]; }
    `,
  );
  await writeFile(
    join(consumerDir, "react-subpath.mjs"),
    `
      import { useConflictAwareEditorRuntime, useEditorHotkeys, useEditorTreeState } from "@moenarch/editor-core/react";
      if (typeof useEditorHotkeys !== "function" || typeof useEditorTreeState !== "function" || typeof useConflictAwareEditorRuntime !== "function") {
        throw new Error("React subpath did not load");
      }
    `,
  );
  await execFileAsync(node, [join(consumerDir, "react-subpath.mjs")], { cwd: consumerDir });
}

async function smokeBrowserBundle(tarball) {
  const consumerDir = join(tempDir, "browser-consumer");
  await mkdir(join(consumerDir, "src"), { recursive: true });
  await writeJson(join(consumerDir, "package.json"), {
    dependencies: {
      "@moenarch/editor-core": `file:${tarball}`,
    },
    private: true,
    type: "module",
  });
  await execFileAsync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: consumerDir,
    env: npmSmokeEnv,
  });
  await writeFile(
    join(consumerDir, "index.html"),
    '<div id="app"></div><script type="module" src="/src/main.ts"></script>',
  );
  await writeFile(
    join(consumerDir, "src", "main.ts"),
    `
      import { createEditorSnapshotHistory } from "@moenarch/editor-core";
      import { encodeEditorSharePayload } from "@moenarch/editor-core/share";
      import { projectEditorTree } from "@moenarch/editor-core/tree";

      const history = createEditorSnapshotHistory({ title: "Draft" });
      const tree = projectEditorTree(history.present, {
        getRoot(document) {
          return { id: "document", label: document.title };
        },
      });
      document.querySelector("#app")!.textContent = tree.root.label;
      void encodeEditorSharePayload(history.present);
    `,
  );
  await writeFile(
    join(consumerDir, "vite.config.mjs"),
    `
      import { defineConfig } from "${join(rootDir, "node_modules", "vite", "dist", "node", "index.js")}";
      export default defineConfig({ build: { emptyOutDir: true, outDir: "dist" } });
    `,
  );
  await execFileAsync(
    node,
    [
      join(rootDir, "node_modules", "vite", "bin", "vite.js"),
      "build",
      "--config",
      "vite.config.mjs",
    ],
    {
      cwd: consumerDir,
    },
  );
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
