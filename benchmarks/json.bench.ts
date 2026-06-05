import { bench, describe } from "vitest";
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

describe("editor-core benchmarks", () => {
  bench("stable JSON stringify", () => {
    stableEditorJsonStringify(benchmarkDocument);
  });

  bench("tree projection", () => {
    projectEditorTree(benchmarkDocument, benchmarkTreeAdapter);
  });
});
