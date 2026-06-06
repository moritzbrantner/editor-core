import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkBenchmarkBaselines,
  mergeBenchmarkResultsBest,
  parseBenchmarkResults,
} from "./check-benchmark-baselines.mjs";

test("parses Vitest benchmark table output", () => {
  const results = parseBenchmarkResults(`
   · stable JSON stringify   9,868.39  0.0840  0.6579
   · tree projection        32,305.05  0.0214  0.4747
  `);

  assert.deepEqual(results, {
    "stable JSON stringify": { hz: 9868.39 },
    "tree projection": { hz: 32305.05 },
  });
});

test("parses Vitest benchmark JSON output", () => {
  const results = parseBenchmarkResults(
    JSON.stringify({
      files: [
        {
          filepath: "benchmarks/json.bench.ts",
          groups: [
            {
              benchmarks: [
                { name: "stable JSON stringify", hz: 9868.39 },
                { name: "tree projection", hz: 32305.05 },
                { name: "ignored benchmark", hz: "not-a-number" },
              ],
            },
          ],
        },
      ],
    }),
  );

  assert.deepEqual(results, {
    "stable JSON stringify": { hz: 9868.39 },
    "tree projection": { hz: 32305.05 },
  });
});

test("parses ANSI-colored Vitest table output", () => {
  const results = parseBenchmarkResults(`
   \u001B[32m·\u001B[39m stable JSON stringify   \u001B[33m9,868.39\u001B[39m  0.0840
  `);

  assert.deepEqual(results, {
    "stable JSON stringify": { hz: 9868.39 },
  });
});

test("ignores Vitest summary lines", () => {
  const results = parseBenchmarkResults(`
stable JSON stringify - benchmarks/json.bench.ts > editor-core benchmarks
   · stable JSON stringify   9,868.39  0.0840  0.6579
  `);

  assert.deepEqual(results, {
    "stable JSON stringify": { hz: 9868.39 },
  });
});

test("merges benchmark attempts with the highest hz", () => {
  const results = mergeBenchmarkResultsBest(
    {
      "stable JSON stringify": { hz: 9000 },
      "tree projection": { hz: 32000 },
    },
    {
      "stable JSON stringify": { hz: 9868.39 },
      "tree projection": { hz: 31000 },
      "entity indexes": { hz: 15000 },
    },
  );

  assert.deepEqual(results, {
    "stable JSON stringify": { hz: 9868.39 },
    "tree projection": { hz: 32000 },
    "entity indexes": { hz: 15000 },
  });
});

test("fails when benchmark results exceed the regression budget", () => {
  const failures = checkBenchmarkBaselines(
    {
      "stable JSON stringify": { hz: 5000 },
    },
    {
      benchmarks: {
        "stable JSON stringify": { hz: 10000 },
      },
      maxRegressionRatio: 0.35,
    },
  );

  assert.equal(failures.length, 1);
  assert.match(failures[0], /stable JSON stringify/u);
});

test("passes benchmark results within the regression budget", () => {
  const failures = checkBenchmarkBaselines(
    {
      "stable JSON stringify": { hz: 7000 },
    },
    {
      benchmarks: {
        "stable JSON stringify": { hz: 10000 },
      },
      maxRegressionRatio: 0.35,
    },
  );

  assert.deepEqual(failures, []);
});
