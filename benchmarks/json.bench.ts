import { bench, describe } from "vitest";
import { createEditorEntityDocument } from "../src/entities.js";
import { createEditorEntityIndexes } from "../src/indexes.js";
import { stableEditorJsonStringify } from "../src/json.js";
import { projectEditorTree, type EditorTreeAdapter } from "../src/tree.js";

type BenchmarkDocument = {
  blocks: Array<{
    id: string;
    text: string;
  }>;
  title: string;
};

const benchmarkDocument: BenchmarkDocument = {
  blocks: Array.from({ length: 250 }, (_, index) => ({
    id: `block-${index}`,
    text: `Paragraph ${index} with deterministic editor content.`,
  })),
  title: "Benchmark document",
};

const benchmarkTreeAdapter: EditorTreeAdapter<BenchmarkDocument> = {
  getRoot(document) {
    return {
      children: document.blocks.map((block, index) => ({
        id: block.id,
        label: block.text,
        path: ["blocks", index],
      })),
      expandedByDefault: true,
      id: "document",
      label: document.title,
    };
  },
};

const benchmarkEntityDocument = createEditorEntityDocument(
  Array.from({ length: 1000 }, (_, index) => ({
    id: `entity-${index}`,
    order: index,
    parentId: index % 10 === 0 ? null : `entity-${Math.floor(index / 10) * 10}`,
    type: "layer",
  })),
);

describe("editor-core benchmarks", () => {
  bench("stable JSON stringify", () => {
    stableEditorJsonStringify(benchmarkDocument);
  });

  bench("tree projection", () => {
    projectEditorTree(benchmarkDocument, benchmarkTreeAdapter);
  });

  bench("entity indexes", () => {
    createEditorEntityIndexes(benchmarkEntityDocument);
  });
});
