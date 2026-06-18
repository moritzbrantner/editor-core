import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkArchitecture } from "./check-architecture.mjs";

const root = await mkdtemp(join(tmpdir(), "editor-core-architecture-test-"));
const src = join(root, "src");
await mkdir(join(src, "react"), { recursive: true });
await mkdir(join(src, "runtime"), { recursive: true });
await mkdir(join(src, "operations"), { recursive: true });
await mkdir(join(src, "persistence"), { recursive: true });

await write("index.ts", 'export * from "./runtime.js";\n');
await write("runtime.ts", 'export * from "./runtime/index.js";\n');
await write("runtime/index.ts", 'export * from "./state.js";\n');
await write("runtime/state.ts", "export const createEditorRuntime = () => null;\n");
await write("operations.ts", 'export * from "./operations/index.js";\n');
await write("operations/index.ts", 'export * from "./runtime.js";\n');
await write(
  "operations/runtime.ts",
  'import { createEditorRuntime } from "../runtime.js";\nexport const create = createEditorRuntime;\n',
);
await write("react.tsx", 'export * from "./react/index.js";\n');
await write(
  "react/index.ts",
  'import * as React from "react";\nexport const useThing = () => React.useMemo(() => null, []);\n',
);

const passing = await checkArchitecture({ rootDir: root });
assert.equal(passing.errors.length, 0);

await write(
  "oversized.test.ts",
  Array.from({ length: 301 }, (_, index) => `export const value${index} = ${index};`).join("\n"),
);
const oversizedTest = await checkArchitecture({ rootDir: root });
assert.equal(oversizedTest.errors.length, 0);
assert.match(
  oversizedTest.warnings.map((warning) => warning.message).join("\n"),
  /Test file has 301 lines/,
);

await write(
  "runtime.test.ts",
  "import { createEditorRuntime } from './runtime.js';\nvoid createEditorRuntime;\n",
);
const rootSplitDomainTest = await checkArchitecture({ rootDir: root });
assert.equal(rootSplitDomainTest.errors.length, 0);
assert.match(
  rootSplitDomainTest.warnings.map((warning) => warning.message).join("\n"),
  /Split-domain tests should live under src\/runtime\//,
);

await write(
  "persistence/test-support.ts",
  'import * as React from "react";\nexport const value = React;\n',
);
const testSupport = await checkArchitecture({ rootDir: root });
assert.equal(testSupport.errors.length, 0);
assert.doesNotMatch(testSupport.warnings.map((warning) => warning.file).join("\n"), /test-support/);

await write(
  "operations/bad-deep.ts",
  'import { createEditorRuntime } from "../runtime/state.js";\nexport const create = createEditorRuntime;\n',
);
const deepImport = await checkArchitecture({ rootDir: root });
assert.match(deepImport.errors.map((error) => error.message).join("\n"), /Cross-domain imports/);

await write("bad-react.ts", 'import * as React from "react";\nexport const value = React;\n');
const reactLeak = await checkArchitecture({ rootDir: root });
assert.match(reactLeak.errors.map((error) => error.message).join("\n"), /React import/);

await write("index.ts", 'export * from "./runtime.js";\nexport * from "./react.js";\n');
const rootReact = await checkArchitecture({ rootDir: root });
assert.match(rootReact.errors.map((error) => error.message).join("\n"), /must not export React/);

await write("index.ts", 'export * from "./runtime.js";\n');
await write("operations/bad-index.ts", 'import { x } from "../index.js";\nexport const y = x;\n');
const indexImport = await checkArchitecture({ rootDir: root });
assert.match(indexImport.errors.map((error) => error.message).join("\n"), /src\/index/);

await write("cycle-a.ts", 'import { b } from "./cycle-b.js";\nexport const a = b;\n');
await write("cycle-b.ts", 'import { a } from "./cycle-a.js";\nexport const b = a;\n');
const cycle = await checkArchitecture({ rootDir: root });
assert.match(cycle.errors.map((error) => error.message).join("\n"), /Import cycle/);

async function write(path, content) {
  await writeFile(join(src, path), content);
}
