import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(
  await readFile(
    new URL("node_modules/@moenarch/editor-core/package.json", import.meta.url),
    "utf8",
  ),
);

const subpaths = Object.keys(manifest.exports).filter((subpath) => subpath !== "./react");
assert.ok(subpaths.length > 10, "expected the public subpath exports");

for (const subpath of subpaths) {
  const specifier =
    subpath === "." ? "@moenarch/editor-core" : `@moenarch/editor-core/${subpath.slice(2)}`;
  const module = await import(specifier);
  const names = Object.keys(module);
  assert.ok(names.length > 0, `${specifier} exports nothing`);
  const hooks = names.filter((name) => /^use[A-Z]/.test(name));
  assert.deepEqual(hooks, [], `${specifier} exposes React hooks`);
}

assert.equal(typeof globalThis.window, "undefined", "a core import created a DOM global");
assert.equal(typeof globalThis.document, "undefined", "a core import created a DOM global");

const { applyEditorOperation, createEditorOperationRuntime } =
  await import("@moenarch/editor-core/operations");
let editor = createEditorOperationRuntime({ initialDocument: { title: "Draft" } });
editor = applyEditorOperation(editor, { id: "rename", apply: () => ({ title: "Done" }) });
assert.equal(editor.runtime.document.title, "Done");
assert.equal(editor.canUndo, true);

console.log(`core-only Node consumer imported ${subpaths.length} subpaths without React or DOM`);
