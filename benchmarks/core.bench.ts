import { bench, describe } from "vitest";
import { createEditorAspect } from "../src/aspects.js";
import { createEditorEntityDocument } from "../src/entities.js";
import { createEditorGraphIndexes, createEditorTimelineIndexes } from "../src/indexes.js";
import {
  applyEditorOperation,
  createEditorOperationRuntime,
  redoEditorOperationRuntime,
  undoEditorOperationRuntime,
} from "../src/operations.js";
import { commitEditorRuntime, createEditorRuntime } from "../src/runtime.js";
import { createEditorEntitySelection, normalizeEditorSelection } from "../src/selection.js";
import { readEditorDocument, type EditorDocumentAdapter } from "../src/serialization.js";
import {
  editorPointToScreenPoint,
  screenPointToEditorPoint,
  type EditorViewportState,
} from "../src/viewport.js";

type RuntimeBenchmarkDocument = {
  blocks: Array<{ id: string; text: string }>;
  title: string;
};

type OperationBenchmarkDocument = {
  nodes: Record<string, { x: number; y: number }>;
};

const runtimeBenchmarkDocument: RuntimeBenchmarkDocument = {
  blocks: Array.from({ length: 120 }, (_, index) => ({
    id: `block-${index}`,
    text: `Benchmark paragraph ${index}`,
  })),
  title: "Benchmark runtime",
};

const wordCountAspect = createEditorAspect<RuntimeBenchmarkDocument, number>({
  id: "word-count",
  derive({ document }) {
    return document.blocks.reduce((count, block) => count + block.text.split(/\s+/u).length, 0);
  },
});

const firstBlockAspect = createEditorAspect<RuntimeBenchmarkDocument, string>({
  id: "first-block",
  derive({ document }) {
    return document.blocks[0]?.text ?? "";
  },
});

const graphEdges = Array.from({ length: 2_000 }, (_, index) => ({
  id: `edge-${index}`,
  sourceId: `node-${index % 500}`,
  targetId: `node-${(index + 1) % 500}`,
}));

const timelineItems = Array.from({ length: 2_000 }, (_, index) => ({
  id: `clip-${index}`,
  range: {
    end: (index % 200) + 5,
    start: index % 200,
  },
  trackId: `track-${index % 50}`,
  type: "clip",
}));

const viewport: EditorViewportState = { x: 320, y: -120, zoom: 1.75 };
const viewportPoints = Array.from({ length: 1_000 }, (_, index) => ({
  x: index * 3,
  y: index * 2,
}));

const selectionEntityDocument = createEditorEntityDocument(
  Array.from({ length: 2_000 }, (_, index) => ({
    id: `entity-${index}`,
    order: index,
    type: "layer",
  })),
);
const selection = createEditorEntitySelection([
  ...Object.keys(selectionEntityDocument.entities),
  "missing-a",
  "missing-b",
]);

const serializedDocumentAdapter: EditorDocumentAdapter<RuntimeBenchmarkDocument> = {
  format: "@benchmark/document",
  schemaVersion: 3,
  normalize(document) {
    return {
      ...document,
      title: document.title.trim(),
    };
  },
  read(input) {
    return input as RuntimeBenchmarkDocument;
  },
  validate(document) {
    return document.title.length === 0 ? [{ path: "title", message: "Title is required." }] : [];
  },
};

const legacySerializedDocument = {
  document: {
    blocks: runtimeBenchmarkDocument.blocks,
    name: "Migrated benchmark",
  },
  format: "@benchmark/document",
  schemaVersion: 1,
};

const operationUndoRedoRuntime = Array.from({ length: 100 }, (_, index) => index).reduce(
  (runtime, index) =>
    applyEditorOperation(runtime, {
      apply: (document) => ({
        nodes: {
          a: {
            x: index,
            y: document.nodes.a.y,
          },
        },
      }),
      id: `move-${index}`,
    }),
  createEditorOperationRuntime<OperationBenchmarkDocument>({
    initialDocument: { nodes: { a: { x: 0, y: 0 } } },
  }),
);

let benchmarkSink: unknown;

function consumeBenchmarkResult(value: unknown): void {
  benchmarkSink = value;
  if (benchmarkSink === Symbol.for("@moenarch/editor-core/unreachable")) {
    throw new Error("Unreachable benchmark sink value.");
  }
}

describe("editor-core critical path benchmarks", () => {
  bench("runtime commit with validation and aspects", () => {
    let runtime = createEditorRuntime({
      aspects: [wordCountAspect, firstBlockAspect],
      initialDocument: runtimeBenchmarkDocument,
      validate(document) {
        return document.blocks.length === 0
          ? [{ path: "blocks", message: "Blocks required." }]
          : [];
      },
    });

    for (let index = 0; index < 10; index += 1) {
      runtime = commitEditorRuntime(runtime, {
        ...runtime.document,
        blocks: runtime.document.blocks.map((block, blockIndex) =>
          blockIndex === 0 ? { ...block, text: `Updated ${index}` } : block,
        ),
      });
    }
    consumeBenchmarkResult(runtime.revision);
  });

  bench("operation runtime merged drag sequence", () => {
    let runtime = createEditorOperationRuntime<OperationBenchmarkDocument>({
      initialDocument: { nodes: { a: { x: 0, y: 0 } } },
    });

    for (let index = 0; index < 100; index += 1) {
      runtime = applyEditorOperation(
        runtime,
        {
          apply: (document) => ({
            nodes: {
              a: {
                x: index,
                y: document.nodes.a.y,
              },
            },
          }),
          id: "drag-node",
          mergeKey: "drag:a",
        },
        { merge: true },
      );
    }
    consumeBenchmarkResult(runtime.operationHistory.undoStack.length);
  });

  bench("operation runtime undo redo", () => {
    let total = 0;
    for (let index = 0; index < 100; index += 1) {
      const undone = undoEditorOperationRuntime(operationUndoRedoRuntime);
      total += redoEditorOperationRuntime(undone).runtime.document.nodes.a.x;
    }
    consumeBenchmarkResult(total);
  });

  bench("graph indexes", () => {
    consumeBenchmarkResult(createEditorGraphIndexes(graphEdges).edgesById.size);
  });

  bench("timeline indexes", () => {
    consumeBenchmarkResult(createEditorTimelineIndexes(timelineItems).trackItemsByTrackId.size);
  });

  bench("viewport bulk coordinate transforms", () => {
    let total = 0;
    for (const point of viewportPoints) {
      const editorPoint = screenPointToEditorPoint(point, viewport);
      const screenPoint = editorPointToScreenPoint(editorPoint, viewport);
      total += screenPoint.x + screenPoint.y;
    }
    consumeBenchmarkResult(total);
  });

  bench("selection normalize large entity set", () => {
    consumeBenchmarkResult(
      normalizeEditorSelection(
        selection,
        (id) => selectionEntityDocument.entities[id] !== undefined,
      ),
    );
  });

  bench("serialization read migrated document", () => {
    for (let index = 0; index < 100; index += 1) {
      consumeBenchmarkResult(
        readEditorDocument(legacySerializedDocument, serializedDocumentAdapter, {
          migrations: {
            1: (input) => ({
              ...input,
              document: {
                blocks: (input.document as { blocks: RuntimeBenchmarkDocument["blocks"] }).blocks,
                title: (input.document as { name: string }).name,
              },
              schemaVersion: 2,
            }),
            2: (input) => ({
              ...input,
              schemaVersion: 3,
            }),
          },
        }),
      );
    }
  });
});
