import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = await mkdtemp(join(tmpdir(), "editor-core-smoke-"));
const node = process.execPath;
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

async function createConsumer(name, tarball) {
  const consumerDir = join(tempDir, name);
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
  return consumerDir;
}

async function smokeHeadlessConsumer(tarball) {
  const consumerDir = await createConsumer("headless-consumer", tarball);

  await writeFile(
    join(consumerDir, "node-esm.mjs"),
    `
      import * as core from "@moenarch/editor-core";
      import { createEditorSnapshotHistory } from "@moenarch/editor-core/history";
      import { stableEditorJsonStringify } from "@moenarch/editor-core/json";
      import { serializeEditorDocument } from "@moenarch/editor-core/serialization";
      import { checkEditorDocumentAdapter } from "@moenarch/editor-core/testing";
      import { projectEditorTree } from "@moenarch/editor-core/tree";
      import { createEditorEntityDocument, createUniqueEditorId } from "@moenarch/editor-core/entities";
      import { createEditorEntityIndexes } from "@moenarch/editor-core/indexes";
      import { createEditorOperationRuntime, applyEditorInteractionOperation } from "@moenarch/editor-core/operations";
      import { createEditorEntitySelection } from "@moenarch/editor-core/selection";
      import { createEditorViewportState, snapEditorValue } from "@moenarch/editor-core/viewport";
      import { applyEditorPatch, diffEditorJson } from "@moenarch/editor-core/patches";
      import { createEditorPluginRegistry } from "@moenarch/editor-core/plugins";
      import { EditorPersistenceConflictError } from "@moenarch/editor-core/persistence";

      if ("useEditorHotkeys" in core || "useEditorTreeState" in core) {
        throw new Error("React hooks leaked from the root entrypoint");
      }
      if (
        "createEditorCollaborationState" in core ||
        "applyEditorRemoteOperation" in core ||
        "applyEditorRemoteOperations" in core ||
        "editorShareUrl" in core ||
        "validateEditorGraphConnection" in core ||
        "validateEditorTimelineRange" in core ||
        "createEditorGraphIndexes" in core ||
        "createEditorTimelineIndexes" in core ||
        "editorTimeToPixel" in core
      ) {
        throw new Error("Domain or collaboration semantics leaked into the generic root entrypoint");
      }

      for (const removedSubpath of ["collaboration", "sync", "share"]) {
        let rejected = false;
        try {
          await import("@moenarch/editor-core/" + removedSubpath);
        } catch (error) {
          rejected = error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED" || error?.code === "ERR_MODULE_NOT_FOUND";
        }
        if (!rejected) {
          throw new Error("Removed subpath is still importable: " + removedSubpath);
        }
      }

      const history = createEditorSnapshotHistory({ title: "Draft" });
      const tree = projectEditorTree(history.present, {
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
      const adapterCheck = checkEditorDocumentAdapter(adapter, {
        expected: { title: "Draft" },
        id: "smoke",
        input: { title: "Draft" },
        roundtrip: true,
      });

      stableEditorJsonStringify({ b: 2, a: 1 });
      serializeEditorDocument(history.present, adapter, { exportedAt: false });
      const entityDocument = createEditorEntityDocument([{ id: "item", type: "item" }]);
      const indexes = createEditorEntityIndexes(entityDocument);
      const uniqueEntityId = createUniqueEditorId("item", []);
      const selection = createEditorEntitySelection(["item"]);
      const viewport = createEditorViewportState({ zoom: 2 });
      const snap = snapEditorValue(9, [{ value: 10 }], 2);
      let runtime = createEditorOperationRuntime({ initialDocument: { value: 0 } });
      runtime = applyEditorInteractionOperation(runtime, {
        id: "set-value",
        mergeKey: "value",
        apply: () => ({ value: 1 }),
      });
      const patch = diffEditorJson({ title: "Draft" }, { title: "Published" });
      const patched = applyEditorPatch({ title: "Draft" }, patch);
      const registry = createEditorPluginRegistry([{ id: "smoke-plugin" }]);
      const conflict = new EditorPersistenceConflictError("stale revision", {
        local: { document: history.present, revisionToken: "server-1" },
      });

      if (
        tree.root.id !== "document" ||
        !adapterCheck.ok ||
        uniqueEntityId !== "item" ||
        !indexes.entitiesById.has("item") ||
        selection.kind !== "entity" ||
        viewport.zoom !== 2 ||
        snap.value !== 10 ||
        runtime.runtime.document.value !== 1 ||
        patched.title !== "Published" ||
        registry.plugins.length !== 1 ||
        conflict.name !== "EditorPersistenceConflictError"
      ) {
        throw new Error("Generic editor-kernel package smoke failed");
      }
    `,
  );
  await execFileAsync(node, [join(consumerDir, "node-esm.mjs")], { cwd: consumerDir });

  await writeFile(
    join(consumerDir, "types.ts"),
    `
      import {
        applyEditorInteractionOperation,
        applyEditorOperation,
        commitEditorRuntime,
        createEditorOperationRuntime,
        createEditorRuntime,
        redoEditorOperationRuntime,
        resetEditorRuntime,
        setEditorRuntimeSelection,
        undoEditorOperationRuntime,
        type EditorOperationRuntimeState,
        type EditorRuntimeState,
      } from "@moenarch/editor-core";

      type Document = { title: string };
      type Selection = { start: number; end: number };

      const runtime = createEditorRuntime<Document, Selection>({
        initialDocument: { title: "Draft" },
        initialSelection: { start: 0, end: 0 },
      });
      // @ts-expect-error Runtime state is opaque and cannot be copied into a fresh runtime value.
      const copiedRuntime: EditorRuntimeState<Document, Selection> = { ...runtime };
      // @ts-expect-error Runtime-owned fields are readonly.
      runtime.revision = 1;
      const committed: EditorRuntimeState<Document, Selection> = commitEditorRuntime(runtime, {
        title: "Committed",
      });
      const reset: EditorRuntimeState<Document, Selection> = resetEditorRuntime(runtime, {
        title: "Reset",
      });
      const selected: EditorRuntimeState<Document, Selection> = setEditorRuntimeSelection(runtime, {
        start: 1,
        end: 2,
      });

      const editor = createEditorOperationRuntime<Document, Selection>({
        initialDocument: { title: "Draft" },
      });
      const operation = { id: "rename", apply: () => ({ title: "Published" }) };
      const applied: EditorOperationRuntimeState<Document, Selection> = applyEditorOperation(
        editor,
        operation,
      );
      const interacted: EditorOperationRuntimeState<Document, Selection> =
        applyEditorInteractionOperation(editor, operation);
      const undone: EditorOperationRuntimeState<Document, Selection> =
        undoEditorOperationRuntime(applied);
      const redone: EditorOperationRuntimeState<Document, Selection> =
        redoEditorOperationRuntime(undone);

      void copiedRuntime;
      void committed;
      void reset;
      void selected;
      void applied;
      void interacted;
      void redone;
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
    { cwd: consumerDir },
  );
}

async function smokeReactSubpath(tarball) {
  const consumerDir = await createConsumer("react-consumer", tarball);
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
      export function useMemo(value) { return value(); }
      export function useRef(value) { return { current: value }; }
      export function useState(value) { return [typeof value === "function" ? value() : value, () => {}]; }
    `,
  );
  await writeFile(
    join(consumerDir, "react-subpath.mjs"),
    `
      import { useEditorHotkeys, useEditorTreeState } from "@moenarch/editor-core/react";
      if (typeof useEditorHotkeys !== "function" || typeof useEditorTreeState !== "function") {
        throw new Error("React subpath did not load");
      }
    `,
  );
  await execFileAsync(node, [join(consumerDir, "react-subpath.mjs")], { cwd: consumerDir });
}

async function smokeBrowserBundle(tarball) {
  const consumerDir = await createConsumer("browser-consumer", tarball);
  await mkdir(join(consumerDir, "src"), { recursive: true });
  await writeFile(
    join(consumerDir, "index.html"),
    '<div id="app"></div><script type="module" src="/src/main.ts"></script>',
  );
  await writeFile(
    join(consumerDir, "src", "main.ts"),
    `
      import { createEditorSnapshotHistory } from "@moenarch/editor-core";
      import { projectEditorTree } from "@moenarch/editor-core/tree";
      import { snapEditorValue } from "@moenarch/editor-core/viewport";

      const history = createEditorSnapshotHistory({ title: "Draft" });
      const tree = projectEditorTree(history.present, {
        getRoot(document) {
          return { id: "document", label: document.title };
        },
      });
      document.querySelector("#app")!.textContent = tree.root.label + snapEditorValue(9, [{ value: 10 }], 2).value;
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
    { cwd: consumerDir },
  );
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
