import assert from "node:assert/strict";
import { test } from "node:test";
import { checkBenchmarkBaselines, parseBenchmarkResults } from "./check-benchmark-baselines.mjs";

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
