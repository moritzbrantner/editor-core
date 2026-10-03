#!/usr/bin/env bun

// Build step of the `prepare` script. A consumer that pins this package as a git dependency
// makes bun run `prepare` inside its node_modules. Below node_modules, esbuild ignores
// tsconfig.json and TypeScript emits no declarations, so the build there would fail or differ.
// In that case, build a copy outside node_modules and copy the build output back.

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const buildOutputs = ["dist"];
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function build(cwd: string) {
  execFileSync("bun", ["run", "build"], { cwd, stdio: "inherit" });
}

if (!packageRoot.split(path.sep).includes("node_modules")) {
  build(packageRoot);
} else {
  const buildRoot = mkdtempSync(path.join(tmpdir(), "git-install-build-"));
  const skipped = new Set(
    ["node_modules", ".git", ...buildOutputs].map((entry) => path.join(packageRoot, entry)),
  );

  try {
    cpSync(packageRoot, buildRoot, {
      recursive: true,
      filter: (source) => !skipped.has(source),
    });
    symlinkSync(
      path.join(packageRoot, "node_modules"),
      path.join(buildRoot, "node_modules"),
      "dir",
    );
    build(buildRoot);

    for (const output of buildOutputs) {
      rmSync(path.join(packageRoot, output), { recursive: true, force: true });
      cpSync(path.join(buildRoot, output), path.join(packageRoot, output), { recursive: true });
    }
  } finally {
    rmSync(buildRoot, { recursive: true, force: true });
  }
}
