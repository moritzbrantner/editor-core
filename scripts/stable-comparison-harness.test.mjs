import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalize,
  compareEditorCoreBuilds,
  createMoonlightHttpComparisonServer,
  findComparisonFailures,
  summarizeComparisonPerformance,
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

test("canonicalizes sets, maps, and function-bearing objects", () => {
  const left = {
    fn() {
      return "ignored";
    },
    map: new Map([
      ["b", new Set(["two", "one"])],
      ["a", { z: 2, a: 1 }],
    ]),
  };
  const right = {
    map: new Map([
      ["a", { a: 1, z: 2 }],
      ["b", new Set(["one", "two"])],
    ]),
    otherFn() {
      return "also ignored";
    },
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

test("serves compare results through HTTP", async () => {
  const api = createFakeEditorCoreApi();
  const server = createMoonlightHttpComparisonServer({
    localApi: api,
    maxRegressionRatio: 0.5,
    minDurationMs: 1,
    stableApi: api,
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/compare`, {
      body: JSON.stringify({ minDurationMs: 1 }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.correctness.passed, true);
    assert.equal(result.performance.passed, true);
    assert.ok(result.summary);
    assert.ok(result.scenarios.length > 0);
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

test("summarizes improvements and regressions", () => {
  assert.deepEqual(
    summarizeComparisonPerformance([
      { name: "fast", ratio: 1.2 },
      { name: "same", ratio: 1.0 },
      { name: "slow", ratio: 0.8 },
      { name: "faster", ratio: 1.5 },
      { name: "slower", ratio: 0.7 },
    ]),
    {
      fastestImprovement: { name: "faster", ratio: 1.5 },
      improved: 2,
      regressed: 2,
      slowestRegression: { name: "slower", ratio: 0.7 },
      unchanged: 1,
    },
  );
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
    createEditorEntityDocument(entities, rootIds) {
      return {
        entities: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
        rootIds:
          rootIds ??
          entities
            .filter((entity) => entity.parentId === undefined || entity.parentId === null)
            .map((entity) => entity.id),
      };
    },
    createEditorEntityIndexes(document) {
      const childrenByParentId = new Map();
      const parentByChildId = new Map();
      for (const entity of Object.values(document.entities)) {
        const parentId = entity.parentId ?? null;
        const children = childrenByParentId.get(parentId) ?? [];
        children.push(entity);
        childrenByParentId.set(parentId, children);
        parentByChildId.set(entity.id, parentId);
      }
      for (const children of childrenByParentId.values()) {
        children.sort((left, right) =>
          String(left.order ?? left.id).localeCompare(String(right.order ?? right.id), undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        );
      }
      const orderedRootIds = [...document.rootIds].sort((leftId, rightId) =>
        String(document.entities[leftId]?.order ?? leftId).localeCompare(
          String(document.entities[rightId]?.order ?? rightId),
          undefined,
          {
            numeric: true,
            sensitivity: "base",
          },
        ),
      );
      return {
        childrenByParentId,
        entitiesById: new Map(Object.entries(document.entities)),
        orderedRootIds,
        parentByChildId,
      };
    },
    createEditorEntitySelection(ids, anchorId = ids.at(-1)) {
      const normalizedIds = [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];
      return {
        anchorId:
          anchorId && normalizedIds.includes(anchorId) ? anchorId : normalizedIds.at(-1),
        ids: normalizedIds,
        kind: "entity",
      };
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
      const trackItemsByTrackId = new Map();
      for (const item of items) {
        const trackItems = trackItemsByTrackId.get(item.trackId) ?? [];
        trackItems.push(item);
        trackItemsByTrackId.set(item.trackId, trackItems);
      }
      for (const trackItems of trackItemsByTrackId.values()) {
        trackItems.sort((left, right) => left.range.start - right.range.start);
      }
      return {
        trackItemsByTrackId,
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
      if (selection.kind !== "entity") {
        return selection;
      }
      const ids = [];
      for (const id of selection.ids) {
        if (hasEntity(id) && !ids.includes(id)) {
          ids.push(id);
        }
      }
      return {
        ...selection,
        anchorId: ids.includes(selection.anchorId) ? selection.anchorId : ids.at(-1),
        ids,
      };
    },
    projectEditorTree(document, adapter) {
      return adapter.getRoot(document);
    },
    readEditorDocument(input, adapter, options = {}) {
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
