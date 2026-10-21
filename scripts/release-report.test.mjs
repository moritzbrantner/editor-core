import assert from "node:assert/strict";
import { test } from "node:test";

import { compare, toMarkdown } from "./release-report.mjs";

const facts = (overrides = {}) => ({
  exportMap: { ".": '{"import":"./dist/index.js"}', "./react": '{"import":"./dist/react.js"}' },
  entrypoints: {
    ".": { kind: "root", api: { a: "1", b: "2" }, jsGzipBytes: 10_000, dtsBytes: 20_000 },
    "./react": { kind: "react", api: { useEditor: "3" }, jsGzipBytes: 1_000, dtsBytes: 2_000 },
  },
  packedFiles: { "dist/index.js": 1 },
  packedBytes: 100,
  unpackedBytes: 200,
  ...overrides,
});

test("additions and small size noise pass", () => {
  const current = facts();
  current.entrypoints["."] = {
    ...current.entrypoints["."],
    api: { a: "1", b: "2", c: "4" },
    jsGzipBytes: 10_300,
  };
  const report = compare(facts(), current);
  assert.equal(report.ok, true, report.failures.join("\n"));
  assert.deepEqual(report.entrypoints[0].api.added, ["c"]);
});

test("breaking fixture: removed export, removed entrypoint and size regression fail", () => {
  const current = facts();
  current.entrypoints["."] = {
    ...current.entrypoints["."],
    api: { a: "changed" },
    jsGzipBytes: 12_000,
  };
  delete current.exportMap["./react"];
  delete current.entrypoints["./react"];
  const report = compare(facts(), current);
  assert.equal(report.ok, false);
  assert.deepEqual(report.failures, [
    "export map: removed ./react",
    ".: removed export b",
    ".: jsGzipBytes 10000 -> 12000 exceeds budget 10512",
  ]);
  assert.deepEqual(report.entrypoints[0].api.changed, ["a"]);
  assert.match(toMarkdown(report), /Result: \*\*fail\*\*/);
});
