import { createServer } from "node:http";
import { performance } from "node:perf_hooks";

export function createStableComparisonScenarios() {
  const jsonDocument = {
    blocks: Array.from({ length: 120 }, (_, index) => ({
      id: `block-${index}`,
      text: `Paragraph ${index} with deterministic editor content.`,
    })),
    title: "Stable comparison document",
  };

  const entityList = Array.from({ length: 500 }, (_, index) => ({
    id: `entity-${index}`,
    order: index,
    parentId: index % 10 === 0 ? null : `entity-${Math.floor(index / 10) * 10}`,
    type: "layer",
  }));

  const graphEdges = Array.from({ length: 1_000 }, (_, index) => ({
    id: `edge-${index}`,
    sourceId: `node-${index % 250}`,
    targetId: `node-${(index + 1) % 250}`,
  }));

  const timelineItems = Array.from({ length: 1_000 }, (_, index) => ({
    id: `clip-${index}`,
    range: {
      end: (index % 200) + 5,
      start: index % 200,
    },
    trackId: `track-${index % 40}`,
    type: "clip",
  }));

  const viewport = { x: 320, y: -120, zoom: 1.75 };
  const viewportPoints = Array.from({ length: 1_000 }, (_, index) => ({
    x: index * 3,
    y: index * 2,
  }));

  return [
    {
      name: "stable JSON stringify and fingerprint",
      run(api) {
        const left = { b: [2, { z: true, a: "first" }], a: 1 };
        const right = { a: 1, b: [2, { a: "first", z: true }] };
        return {
          equal: api.createStableEditorJsonEquals()(left, right),
          fingerprint: api.stableEditorJsonFingerprint(left),
          text: api.stableEditorJsonStringify(right),
        };
      },
    },
    {
      name: "tree projection",
      run(api) {
        return api.projectEditorTree(jsonDocument, {
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
        });
      },
    },
    {
      name: "entity and graph indexes",
      run(api) {
        const entityDocument = api.createEditorEntityDocument(entityList);
        return {
          entities: api.createEditorEntityIndexes(entityDocument),
          graph: api.createEditorGraphIndexes(graphEdges),
          timeline: api.createEditorTimelineIndexes(timelineItems),
        };
      },
    },
    {
      name: "runtime commit with aspects",
      run(api) {
        const wordCountAspect = api.createEditorAspect({
          id: "word-count",
          derive({ document }) {
            return document.blocks.reduce(
              (count, block) => count + block.text.split(/\s+/u).length,
              0,
            );
          },
        });
        let runtime = api.createEditorRuntime({
          aspects: [wordCountAspect],
          initialDocument: jsonDocument,
          validate(document) {
            return document.blocks.length === 0
              ? [{ path: "blocks", message: "Blocks required." }]
              : [];
          },
        });

        for (let index = 0; index < 20; index += 1) {
          runtime = api.commitEditorRuntime(runtime, {
            ...runtime.document,
            blocks: runtime.document.blocks.map((block, blockIndex) =>
              blockIndex === 0 ? { ...block, text: `Updated ${index}` } : block,
            ),
          });
        }
        return {
          aspect: runtime.aspectSnapshot.aspects["word-count"],
          issues: runtime.issues,
          revision: runtime.revision,
          status: runtime.status,
        };
      },
    },
    {
      name: "operation runtime undo redo",
      run(api) {
        let runtime = api.createEditorOperationRuntime({
          initialDocument: { nodes: { a: { x: 0, y: 0 } } },
        });

        for (let index = 0; index < 100; index += 1) {
          runtime = api.applyEditorOperation(
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

        const undone = api.undoEditorOperationRuntime(runtime);
        const redone = api.redoEditorOperationRuntime(undone);
        return {
          afterRedo: redone.runtime.document,
          afterUndo: undone.runtime.document,
          redoDepth: redone.operationHistory.redoStack.length,
          undoDepth: redone.operationHistory.undoStack.length,
        };
      },
    },
    {
      name: "selection and viewport helpers",
      run(api) {
        const entityDocument = api.createEditorEntityDocument(entityList);
        const selection = api.createEditorEntitySelection([
          ...Object.keys(entityDocument.entities),
          "missing-a",
          "missing-b",
        ]);
        let total = 0;
        for (const point of viewportPoints) {
          const editorPoint = api.screenPointToEditorPoint(point, viewport);
          const screenPoint = api.editorPointToScreenPoint(editorPoint, viewport);
          total += screenPoint.x + screenPoint.y;
        }
        return {
          normalizedSelection: api.normalizeEditorSelection(
            selection,
            (id) => entityDocument.entities[id] !== undefined,
          ),
          viewportTotal: total,
        };
      },
    },
    {
      name: "patch diff apply invert",
      run(api) {
        const before = {
          blocks: [
            { id: "a", text: "Draft" },
            { id: "b", text: "Keep" },
          ],
          title: "Before",
        };
        const after = {
          blocks: [
            { id: "a", text: "Published" },
            { id: "c", text: "New" },
          ],
          title: "After",
        };
        const patch = api.diffEditorJson(before, after);
        return {
          applied: api.applyEditorPatch(before, patch),
          inverted: api.applyEditorPatch(after, api.invertEditorPatch(patch)),
          patch,
        };
      },
    },
    {
      name: "serialization migrated document read",
      run(api) {
        return api.readEditorDocument(
          {
            document: {
              blocks: jsonDocument.blocks,
              name: "Migrated stable comparison",
            },
            format: "@stable-comparison/document",
            schemaVersion: 1,
          },
          {
            format: "@stable-comparison/document",
            normalize(document) {
              return {
                ...document,
                title: document.title.trim(),
              };
            },
            read(input) {
              return input;
            },
            schemaVersion: 3,
            validate(document) {
              return document.title.length === 0
                ? [{ path: "title", message: "Title is required." }]
                : [];
            },
          },
          {
            migrations: {
              1: (input) => ({
                ...input,
                document: {
                  blocks: input.document.blocks,
                  title: input.document.name,
                },
                schemaVersion: 2,
              }),
              2: (input) => ({
                ...input,
                schemaVersion: 3,
              }),
            },
          },
        );
      },
    },
  ];
}

export async function compareEditorCoreBuilds({
  localApi,
  maxRegressionRatio = 0.5,
  minDurationMs = 100,
  stableApi,
}) {
  const scenarios = createStableComparisonScenarios();
  const scenarioResults = [];
  const correctnessFailures = [];
  const performanceFailures = [];

  for (const scenario of scenarios) {
    const stableOutput = scenario.run(stableApi);
    const localOutput = scenario.run(localApi);
    const stableCanonical = canonicalize(stableOutput);
    const localCanonical = canonicalize(localOutput);
    const correct = stableCanonical === localCanonical;

    if (!correct) {
      correctnessFailures.push(`Scenario "${scenario.name}" returned different output.`);
    }

    const stableMeasurement = measureScenario(() => scenario.run(stableApi), minDurationMs);
    const localMeasurement = measureScenario(() => scenario.run(localApi), minDurationMs);
    const minimumLocalHz = stableMeasurement.hz * (1 - maxRegressionRatio);
    const performanceOk = localMeasurement.hz >= minimumLocalHz;

    if (!performanceOk) {
      performanceFailures.push(
        `Scenario "${scenario.name}" ran at ${formatHz(
          localMeasurement.hz,
        )} hz locally; expected at least ${formatHz(minimumLocalHz)} hz.`,
      );
    }

    scenarioResults.push({
      correct,
      localHz: localMeasurement.hz,
      localIterations: localMeasurement.iterations,
      name: scenario.name,
      performanceOk,
      ratio: localMeasurement.hz / stableMeasurement.hz,
      stableHz: stableMeasurement.hz,
      stableIterations: stableMeasurement.iterations,
    });
  }

  return {
    correctness: {
      failures: correctnessFailures,
      passed: correctnessFailures.length === 0,
    },
    maxRegressionRatio,
    performance: {
      failures: performanceFailures,
      passed: performanceFailures.length === 0,
    },
    scenarios: scenarioResults,
  };
}

export function createMoonlightHttpComparisonServer(context) {
  return createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        writeJson(response, 200, { ok: true, service: "moonlight-http-stable-comparison" });
        return;
      }

      if (request.method === "POST" && request.url === "/compare") {
        const body = await readRequestJson(request);
        const result = await compareEditorCoreBuilds({
          localApi: context.localApi,
          maxRegressionRatio: body.maxRegressionRatio ?? context.maxRegressionRatio,
          minDurationMs: body.minDurationMs ?? context.minDurationMs,
          stableApi: context.stableApi,
        });
        writeJson(response, 200, result);
        return;
      }

      writeJson(response, 404, { error: "Not found" });
    } catch (error) {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export async function runComparisonThroughMoonlightHttp(context) {
  const server = createMoonlightHttpComparisonServer(context);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(context.port ?? 0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Comparison server did not bind to a TCP port.");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/compare`, {
      body: JSON.stringify({
        maxRegressionRatio: context.maxRegressionRatio,
        minDurationMs: context.minDurationMs,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Comparison server returned HTTP ${response.status}.`);
    }

    return await response.json();
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

export function canonicalize(value) {
  return JSON.stringify(toCanonicalValue(value));
}

export function toCanonicalValue(value) {
  if (value instanceof Map) {
    return {
      __type: "Map",
      entries: [...value.entries()]
        .map(([key, mapValue]) => [toCanonicalValue(key), toCanonicalValue(mapValue)])
        .sort(([left], [right]) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    };
  }

  if (value instanceof Set) {
    return {
      __type: "Set",
      values: [...value.values()]
        .map((setValue) => toCanonicalValue(setValue))
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => toCanonicalValue(item));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, objectValue]) => typeof objectValue !== "function")
      .sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(
      entries.map(([key, objectValue]) => [key, toCanonicalValue(objectValue)]),
    );
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? Number(value.toPrecision(12)) : String(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "symbol") {
    return value.toString();
  }

  return value;
}

export function findComparisonFailures(result) {
  return [...(result.correctness?.failures ?? []), ...(result.performance?.failures ?? [])];
}

function measureScenario(run, minDurationMs) {
  for (let index = 0; index < 5; index += 1) {
    run();
  }

  let iterations = 0;
  const startedAt = performance.now();
  let elapsedMs = 0;
  while (elapsedMs < minDurationMs || iterations < 5) {
    run();
    iterations += 1;
    elapsedMs = performance.now() - startedAt;
  }

  return {
    hz: iterations / (elapsedMs / 1000),
    iterations,
  };
}

async function readRequestJson(request) {
  let text = "";
  for await (const chunk of request) {
    text += String(chunk);
  }
  return text.trim() ? JSON.parse(text) : {};
}

function writeJson(response, statusCode, value) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function formatHz(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}
