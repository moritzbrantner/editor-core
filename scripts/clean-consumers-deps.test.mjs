import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  collectEditorPackageCopies,
  findEditorDependencyProblems,
} from "./clean-consumers-deps.mjs";

async function writePackage(dir, manifest) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "package.json"), JSON.stringify(manifest));
}

test("a nested second editor-core copy fails the dependency assertion", async () => {
  const root = await mkdtemp(join(tmpdir(), "editor-deps-"));
  try {
    const modules = join(root, "node_modules");
    await writePackage(join(modules, "@moenarch/editor-core"), {
      name: "@moenarch/editor-core",
      version: "0.5.0",
    });
    await writePackage(join(modules, "@moritzbrantner/ui"), {
      name: "@moritzbrantner/ui",
      version: "1.0.0",
    });
    await writePackage(join(modules, "@moritzbrantner/ui/node_modules/@moenarch/editor-core"), {
      name: "@moenarch/editor-core",
      version: "0.4.0",
    });

    const copies = await collectEditorPackageCopies(root);
    const problems = findEditorDependencyProblems({ copies });

    assert.equal(copies.length, 3);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /@moenarch\/editor-core is installed 2 times: 0\.5\.0 .*, 0\.4\.0/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("incompatible editor-family peers reported by npm fail; unrelated problems do not", () => {
  const copies = [{ name: "@moenarch/editor-core", path: "node_modules/x", version: "0.5.0" }];
  const problems = findEditorDependencyProblems({
    copies,
    npmProblems: [
      "invalid: @moenarch/editor-core@0.5.0 node_modules/x",
      "extraneous: left-pad@1.0.0 node_modules/left-pad",
    ],
  });

  assert.deepEqual(problems, ["invalid: @moenarch/editor-core@0.5.0 node_modules/x"]);
});
