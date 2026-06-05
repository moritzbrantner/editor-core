import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseBenchmarkResults(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    return {};
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return normalizeBenchmarkJson(JSON.parse(trimmed));
  }

  const results = {};
  for (const line of input.split(/\r?\n/u)) {
    const match = line.match(/^\s*[·-]\s+(.+?)\s{2,}([\d,]+(?:\.\d+)?)/u);
    if (!match) {
      continue;
    }

    results[match[1]] = {
      hz: Number(match[2].replace(/,/g, "")),
    };
  }
  return results;
}

export function checkBenchmarkBaselines(results, baseline) {
  const defaultMaxRegressionRatio = baseline.maxRegressionRatio ?? 0.35;
  const failures = [];

  for (const [name, expected] of Object.entries(baseline.benchmarks ?? {})) {
    const actual = results[name];
    if (!actual) {
      failures.push(`Missing benchmark result for "${name}".`);
      continue;
    }

    const expectedHz = expected.hz;
    const actualHz = actual.hz;
    if (!Number.isFinite(expectedHz) || !Number.isFinite(actualHz)) {
      failures.push(`Benchmark "${name}" does not have finite hz values.`);
      continue;
    }

    const maxRegressionRatio = expected.maxRegressionRatio ?? defaultMaxRegressionRatio;
    const minimumHz = expectedHz * (1 - maxRegressionRatio);
    if (actualHz < minimumHz) {
      failures.push(
        `Benchmark "${name}" regressed to ${formatHz(actualHz)} hz; expected at least ${formatHz(
          minimumHz,
        )} hz (${Math.round(maxRegressionRatio * 100)}% regression budget).`,
      );
    }
  }

  return failures;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const resultsPath = resolve(rootDir, process.argv[2] ?? "benchmark-results/vitest-bench.txt");
  const baselinePath = resolve(rootDir, process.argv[3] ?? "docs/performance-baselines.json");
  const [resultsText, baselineText] = await Promise.all([
    readFile(resultsPath, "utf8"),
    readFile(baselinePath, "utf8"),
  ]);
  const failures = checkBenchmarkBaselines(
    parseBenchmarkResults(resultsText),
    JSON.parse(baselineText),
  );

  if (failures.length > 0) {
    process.stderr.write(`${failures.join("\n")}\n`);
    process.exitCode = 1;
  }
}

function normalizeBenchmarkJson(input) {
  if (Array.isArray(input)) {
    return Object.fromEntries(input.map((entry) => [entry.name, { hz: Number(entry.hz) }]));
  }

  if (input.benchmarks && typeof input.benchmarks === "object") {
    return Object.fromEntries(
      Object.entries(input.benchmarks).map(([name, value]) => [name, { hz: Number(value.hz) }]),
    );
  }

  return Object.fromEntries(
    Object.entries(input).map(([name, value]) => [name, { hz: Number(value.hz) }]),
  );
}

function formatHz(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}
