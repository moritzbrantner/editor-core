# @moritzbrantner/editor-core

Headless shared infrastructure for Moritz Brantner editor packages.

```ts
import { createEditorSnapshotHistory, serializeEditorDocument } from "@moritzbrantner/editor-core";
```

## Adapter-first tree composition

Project any host document into an inspectable editing tree without changing the document model:

```ts
import { projectEditorTree } from "@moritzbrantner/editor-core/tree";

const tree = projectEditorTree(document, {
  getRoot(document) {
    return {
      id: "document",
      label: document.title,
      children: [{ id: "document.body", label: "Body", path: ["body"] }],
    };
  },
});
```

Tree adapters should emit stable string ids. Stable ids let selection and future collaborative
state survive document updates, reordering, and synchronization.

## React example

Run the GitHub Pages example locally:

```sh
bun run example:dev
```

Build the static site:

```sh
bun run example:build
```

The Pages workflow in `.github/workflows/pages.yml` publishes the built example from
`examples/react/dist` on pushes to `main`.

## Validation

Run the full local gate:

```sh
bun run verify
```

Focused checks are available for unit tests, integration/package smoke tests, Playwright e2e,
Storybook, Unlighthouse, and benchmarks:

```sh
bun run test:unit
bun run test:integration
bun run test:e2e
bun run test:storybook
bun run unlighthouse
bun run bench
```
