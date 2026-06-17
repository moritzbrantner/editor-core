import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalize,
  compareEditorCoreBuilds,
  createMoonlightHttpComparisonServer,
  findComparisonFailures,
} from "./stable-comparison-harness.mjs";

test("canonicalizes object keys and map entries deterministically", () => {
  const left = {
    map: new Map([
      ["b", { z: 2, a: 1 }],
      ["a", ["first"]],
    ]),
  };
  const right = {
    map: new Map([
      ["a", ["first"]],
      ["b", { a: 1, z: 2 }],
    ]),
  };

  assert.equal(canonicalize(left), canonicalize(right));
});

test("finds correctness failures before performance failures", () => {
  assert.deepEqual(
    findComparisonFailures({
      correctness: { failures: ["wrong result"] },
      performance: { failures: ["slow result"] },
    }),
    ["wrong result", "slow result"],
  );
});

test("exposes a health endpoint through the HTTP harness", async () => {
  const server = createMoonlightHttpComparisonServer({});
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      service: "moonlight-http-stable-comparison",
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("reports correctness differences", async () => {
  const api = createFakeEditorCoreApi();
  const changedApi = {
    ...api,
    stableEditorJsonStringify(value) {
      return `${api.stableEditorJsonStringify(value)}changed`;
    },
  };

  const result = await compareEditorCoreBuilds({
    localApi: changedApi,
    maxRegressionRatio: 0.95,
    minDurationMs: 1,
    stableApi: api,
  });

  assert.equal(result.correctness.passed, false);
  assert.match(result.correctness.failures[0], /stable JSON/u);
});

function createFakeEditorCoreApi() {
  const json = (value) => canonicalize(value);
  return {
    applyEditorPatch(value, patch) {
      return patch.reduce((next, operation) => {
        if (operation.op === "replace" && operation.path.length === 0) {
          return operation.value;
        }
        return next;
      }, value);
    },
    applyEditorOperation(runtime, operation) {
      const nextDocument = operation.apply(runtime.runtime.document);
      return {
        ...runtime,
        operationHistory: {
          redoStack: [],
          undoStack: [runtime.runtime.document],
        },
        runtime: {
          ...runtime.runtime,
          document: nextDocument,
        },
      };
    },
    commitEditorRuntime(runtime, document) {
      return createRuntime({
        aspects: runtime.aspectDefinitions,
        document,
        revision: runtime.revision + 1,
        validate: runtime.validate,
      });
    },
    createEditorAspect(definition) {
      return definition;
    },
    createEditorEntityDocument(entities) {
      return {
        entities: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
        rootIds: entities
          .filter((entity) => entity.parentId === undefined || entity.parentId === null)
          .map((entity) => entity.id),
      };
    },
    createEditorEntityIndexes(document) {
      return {
        childrenByParentId: new Map(),
        entitiesById: new Map(Object.entries(document.entities)),
        orderedRootIds: document.rootIds,
        parentByChildId: new Map(),
      };
    },
    createEditorEntitySelection(ids) {
      return { ids, kind: "entity" };
    },
    createEditorGraphIndexes(edges) {
      return {
        edgesById: new Map(edges.map((edge) => [edge.id, edge])),
        incomingEdgesByNodeId: new Map(),
        outgoingEdgesByNodeId: new Map(),
      };
    },
    createEditorOperationRuntime({ initialDocument }) {
      return {
        operationHistory: {
          redoStack: [],
          undoStack: [],
        },
        runtime: {
          document: initialDocument,
        },
      };
    },
    createEditorRuntime({ aspects = [], initialDocument, validate = () => [] }) {
      return createRuntime({
        aspects,
        document: initialDocument,
        revision: 0,
        validate,
      });
    },
    createEditorTimelineIndexes(items) {
      return {
        trackItemsByTrackId: new Map(items.map((item) => [item.trackId, [item]])),
      };
    },
    createStableEditorJsonEquals() {
      return (left, right) => json(left) === json(right);
    },
    diffEditorJson(before, after) {
      return [{ oldValue: before, op: "replace", path: [], value: after }];
    },
    editorPointToScreenPoint(point, viewport) {
      return {
        x: point.x * viewport.zoom + viewport.x,
        y: point.y * viewport.zoom + viewport.y,
      };
    },
    invertEditorPatch(patch) {
      return patch.map((operation) => ({
        oldValue: operation.value,
        op: operation.op,
        path: operation.path,
        value: operation.oldValue,
      }));
    },
    normalizeEditorSelection(selection, hasEntity) {
      return {
        ...selection,
        ids: selection.ids.filter((id) => hasEntity(id)),
      };
    },
    projectEditorTree(document, adapter) {
      return adapter.getRoot(document);
    },
    readEditorDocument(input, adapter, options) {
      let current = input;
      while (current.schemaVersion < adapter.schemaVersion) {
        current = options.migrations[current.schemaVersion](current);
      }
      return adapter.normalize(adapter.read(current.document));
    },
    redoEditorOperationRuntime(runtime) {
      return runtime;
    },
    screenPointToEditorPoint(point, viewport) {
      return {
        x: (point.x - viewport.x) / viewport.zoom,
        y: (point.y - viewport.y) / viewport.zoom,
      };
    },
    stableEditorJsonFingerprint: json,
    stableEditorJsonStringify: json,
    undoEditorOperationRuntime(runtime) {
      return {
        ...runtime,
        runtime: {
          ...runtime.runtime,
          document: runtime.operationHistory.undoStack[0] ?? runtime.runtime.document,
        },
      };
    },
  };
}

function createRuntime({ aspects, document, revision, validate }) {
  const aspectSnapshot = {
    aspects: Object.fromEntries(
      aspects.map((aspect) => [
        aspect.id,
        {
          changed: true,
          id: aspect.id,
          value: aspect.derive({ document }),
        },
      ]),
    ),
    document,
    revision,
  };

  return {
    aspectDefinitions: aspects,
    aspectSnapshot,
    dirty: revision > 0,
    document,
    issues: validate(document),
    revision,
    status: revision > 0 ? "dirty" : "clean",
    validate,
  };
}
