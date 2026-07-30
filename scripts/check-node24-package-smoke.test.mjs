import assert from "node:assert/strict";
import { test } from "node:test";
import { requireNodeMajor } from "./check-node24-package-smoke.mjs";

test("accepts Node 24", () => {
  assert.doesNotThrow(() => requireNodeMajor("24.11.0", 24));
});

test("rejects a different Node major", () => {
  assert.throws(() => requireNodeMajor("22.23.1", 24), /Node 24 is required/u);
});
