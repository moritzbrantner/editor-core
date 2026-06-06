# Adoption Guide

Use this guide when adding `@moritzbrantner/editor-core` to a downstream editor package.

## Minimal Runtime

Use `createEditorRuntime` when whole-document snapshot history is enough:

```ts
import {
  commitEditorRuntime,
  createEditorRuntime,
  createEditorRuntimeCommands,
} from "@moritzbrantner/editor-core/runtime";

type Document = {
  body: string;
  title: string;
};

let runtime = createEditorRuntime<Document>({
  initialDocument: { body: "", title: "Draft" },
  validate(document) {
    return document.title.trim() ? [] : [{ path: "title", message: "Title is required." }];
  },
});

runtime = commitEditorRuntime(runtime, ({ document }) => ({
  ...document,
  title: "Release Notes",
}));

const commands = createEditorRuntimeCommands({
  getResetDocument: () => ({ body: "", title: "Draft" }),
  runtime,
  setRuntime(updater) {
    runtime = updater(runtime);
  },
});
```

Prefer snapshot history for small immutable documents where each undo step can store the full
document. Prefer operation runtime when edits need semantic labels, merged drag transactions, or
selection restoration.

## Document Adapter

Adapters own the downstream document contract. Keep `format` globally specific and bump
`schemaVersion` whenever serialized input needs a migration.

```ts
import type { EditorDocumentAdapter, EditorDocumentMigrations } from "@moritzbrantner/editor-core";

type Document = {
  body: string;
  title: string;
  updatedAt: string;
};

export const adapter: EditorDocumentAdapter<Document> = {
  format: "@example/editor/document",
  schemaVersion: 2,
  normalize(document) {
    return {
      body: document.body,
      title: document.title.trim() || "Untitled",
      updatedAt: document.updatedAt,
    };
  },
  read(input) {
    const value = input as Partial<Document>;
    return {
      body: typeof value.body === "string" ? value.body : "",
      title: typeof value.title === "string" ? value.title : "Untitled",
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
    };
  },
  validate(document) {
    return document.title ? [] : [{ path: "title", message: "Title is required." }];
  },
};

export const migrations: EditorDocumentMigrations<Document> = {
  1: (input) => ({
    ...input,
    document: {
      ...(input.document as Record<string, unknown>),
      updatedAt: new Date().toISOString(),
    },
    schemaVersion: 2,
  }),
};
```

## Adapter Contract Tests

The testing subpath is framework-free. Use it from Vitest, Jest, Node test, or custom CI scripts.

```ts
import { assertEditorDocumentAdapter } from "@moritzbrantner/editor-core/testing";
import { adapter, migrations } from "./document-adapter.js";

assertEditorDocumentAdapter(adapter, [
  {
    expected: {
      body: "",
      title: "Draft",
      updatedAt: "2026-06-06T12:00:00.000Z",
    },
    id: "current-envelope",
    input: {
      document: {
        title: " Draft ",
        updatedAt: "2026-06-06T12:00:00.000Z",
      },
      format: adapter.format,
      schemaVersion: adapter.schemaVersion,
    },
    roundtrip: true,
  },
  {
    expected: {
      body: "",
      title: "Migrated",
      updatedAt: expect.any(String),
    },
    id: "v1-migration",
    input: {
      document: { title: "Migrated" },
      format: adapter.format,
      schemaVersion: 1,
    },
    migrations,
  },
]);
```

If the runner does not support matcher objects such as `expect.any`, use
`checkEditorDocumentAdapter` and compare the returned `value` directly.

## Persistent Runtime

Storage adapters only load and save documents. Runtime history, selection, and revisions are
rebuilt around the loaded document.

```ts
import {
  createLocalStorageEditorStorage,
  readEditorDocument,
  serializeEditorDocument,
} from "@moritzbrantner/editor-core";
import { usePersistentEditorRuntime } from "@moritzbrantner/editor-core/react";
import { adapter, migrations } from "./document-adapter.js";

const storage = createLocalStorageEditorStorage({
  key: "@example/editor/document",
  parse(input) {
    return readEditorDocument(input, adapter, { migrations });
  },
  serialize(document) {
    return serializeEditorDocument(document, adapter);
  },
});

const runtime = usePersistentEditorRuntime({
  autosave: {
    delayMs: 750,
    retry: { attempts: 1, delayMs: 1500 },
    saveLatest: true,
  },
  initialDocument,
  onPersistenceEvent(event) {
    console.debug("[editor:persistence]", event);
  },
  storage,
});
```

`saveLatest: true` schedules one follow-up save when a newer dirty revision appears while an older
save is still in flight. A stale save completion never marks the newer revision clean.

## Operation Logs

Use operation logs when a downstream editor needs importable semantic edit history:

```ts
import {
  readEditorOperationLog,
  serializeEditorOperationLog,
  type EditorOperationLogAdapter,
} from "@moritzbrantner/editor-core/operations";

type RenameOperation = {
  id: string;
  type: "rename";
  payload: { title: string };
};

const operationAdapter: EditorOperationLogAdapter<RenameOperation> = {
  format: "@example/editor/operations",
  schemaVersion: 1,
  read(input) {
    return input as RenameOperation;
  },
  validate(operation) {
    return operation.id ? [] : [{ path: "id", message: "Operation id is required." }];
  },
};

const exported = serializeEditorOperationLog(
  [{ id: "rename-title", type: "rename", schemaVersion: 1, payload: { title: "Launch" } }],
  {
    format: operationAdapter.format,
    schemaVersion: operationAdapter.schemaVersion,
  },
);
const operations = readEditorOperationLog(exported, operationAdapter);
```

Use `assertEditorOperationLogAdapter` from `/testing` for operation-log adapter coverage.

## Command Diagnostics

Run command diagnostics in development or CI to catch duplicate ids and bad shortcuts:

```ts
import { getEditorCommandDiagnostics } from "@moritzbrantner/editor-core/commands";

const diagnostics = getEditorCommandDiagnostics(commands);
if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
  throw new Error(JSON.stringify(diagnostics, null, 2));
}
```

Disabled commands do not participate in hotkey conflict warnings.

## Downstream Release Checklist

Before releasing a downstream editor package:

- Run adapter contract tests for current envelopes, old migrations, legacy unwraps, and validation
  failures.
- Run command diagnostics against the command set used by the UI.
- Verify persistence load, clean save skip, dirty save, save failure, and autosave retry behavior.
- Smoke import every public subpath used by the package.
- Update downstream changelog entries for schema-version bumps and migration behavior.
