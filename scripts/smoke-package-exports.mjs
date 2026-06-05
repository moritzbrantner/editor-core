import assert from "node:assert/strict";

const entrypoints = [
  ".",
  "./aspects",
  "./commands",
  "./history",
  "./json",
  "./serialization",
  "./hotkeys",
  "./browser",
  "./share",
  "./tree",
  "./react",
];

for (const entrypoint of entrypoints) {
  const module = await import(
    `@moritzbrantner/editor-core${entrypoint === "." ? "" : entrypoint.slice(1)}`
  );
  assert.equal(typeof module, "object", entrypoint);
}

const core = await import("@moritzbrantner/editor-core");
assert.equal(typeof core.createEditorAspect, "function");
assert.equal(typeof core.createEditorSnapshotHistoryCommands, "function");
assert.equal(typeof core.createEditorSnapshotHistory, "function");
assert.equal(typeof core.projectEditorTree, "function");
assert.equal(typeof core.stableEditorJsonStringify, "function");
assert.equal(typeof core.serializeEditorDocument, "function");
