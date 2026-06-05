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

try {
  const { stdout } = await execFileAsync("npm", ["pack", "--pack-destination", tempDir], {
    cwd: rootDir,
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
      "@moritzbrantner/editor-core": `file:${tarball}`,
    },
    private: true,
    type: "module",
  });
  await execFileAsync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: consumerDir,
  });

  assert.equal(existsSync(join(consumerDir, "node_modules", "react")), false);

  await writeFile(
    join(consumerDir, "node-esm.mjs"),
    `
      import * as core from "@moritzbrantner/editor-core";
      import { createEditorSnapshotHistory } from "@moritzbrantner/editor-core/history";
      import { stableEditorJsonStringify } from "@moritzbrantner/editor-core/json";
      import { serializeEditorDocument } from "@moritzbrantner/editor-core/serialization";
      import { matchesEditorHotkey } from "@moritzbrantner/editor-core/hotkeys";
      import { projectEditorTree } from "@moritzbrantner/editor-core/tree";
      import { createEditorAspect } from "@moritzbrantner/editor-core/aspects";
      import { editorShareUrl } from "@moritzbrantner/editor-core/share";
      import { ensureEditorJsonFilename } from "@moritzbrantner/editor-core/browser";
      import { createEditorSnapshotHistoryCommands } from "@moritzbrantner/editor-core/commands";

      if ("useEditorHotkeys" in core || "useEditorTreeState" in core) {
        throw new Error("React hooks leaked from the root entrypoint");
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
      matchesEditorHotkey({ altKey: false, ctrlKey: true, key: "z", metaKey: false, shiftKey: false, target: null }, "Mod+Z");
      createEditorAspect({ id: "title", derive: ({ document }) => document.title });
      editorShareUrl("https://example.com", "/editor", "plain.token");
      ensureEditorJsonFilename("document");
      createEditorSnapshotHistoryCommands({
        getResetDocument: () => history.present,
        history,
        setHistory() {},
      });

      if (tree.root.id !== "document") {
        throw new Error("Tree projection failed");
      }
    `,
  );
  await execFileAsync(node, [join(consumerDir, "node-esm.mjs")], { cwd: consumerDir });

  await writeFile(
    join(consumerDir, "node-compat.mjs"),
    `
      import { decodeEditorSharePayload, encodeEditorSharePayload } from "@moritzbrantner/editor-core/share";

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
        type EditorSnapshotHistory,
      } from "@moritzbrantner/editor-core";
      import type { EditorTreeAdapter } from "@moritzbrantner/editor-core/tree";

      type Document = { title: string };
      const history: EditorSnapshotHistory<Document> = createEditorSnapshotHistory({ title: "Draft" });
      const adapter: EditorTreeAdapter<Document> = {
        getRoot(document) {
          return { id: "document", label: document.title };
        },
      };

      void history;
      void adapter;
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
      "@moritzbrantner/editor-core": `file:${tarball}`,
    },
    private: true,
    type: "module",
  });
  await execFileAsync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: consumerDir,
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
      import { useEditorHotkeys, useEditorTreeState } from "@moritzbrantner/editor-core/react";
      if (typeof useEditorHotkeys !== "function" || typeof useEditorTreeState !== "function") {
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
      "@moritzbrantner/editor-core": `file:${tarball}`,
    },
    private: true,
    type: "module",
  });
  await execFileAsync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: consumerDir,
  });
  await writeFile(
    join(consumerDir, "index.html"),
    '<div id="app"></div><script type="module" src="/src/main.ts"></script>',
  );
  await writeFile(
    join(consumerDir, "src", "main.ts"),
    `
      import { createEditorSnapshotHistory } from "@moritzbrantner/editor-core";
      import { encodeEditorSharePayload } from "@moritzbrantner/editor-core/share";
      import { projectEditorTree } from "@moritzbrantner/editor-core/tree";

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
