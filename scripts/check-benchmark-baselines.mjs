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
  const text = stripAnsi(input).replace(/\r\n?/gu, "\n");
  for (const line of text.split("\n")) {
    const match = line.match(/^[\s│┃┆]*[·•*-]\s+(.+?)\s{2,}([\d,]+(?:\.\d+)?)(?:\s|$)/u);
    if (!match) {
      continue;
    }

    const hz = Number(match[2].replace(/,/g, ""));
    if (Number.isFinite(hz)) {
      results[match[1]] = { hz };
    }
  }
  return results;
}

export function mergeBenchmarkResultsBest(existing, next) {
  const merged = { ...existing };

  for (const [name, result] of Object.entries(next)) {
    const hz = parseHz(result?.hz);
    if (!Number.isFinite(hz)) {
      continue;
    }

    const currentHz = Number(merged[name]?.hz);
    if (!Number.isFinite(currentHz) || hz > currentHz) {
      merged[name] = { hz };
    }
  }

  return merged;
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

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
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
    return normalizeBenchmarkEntries(input);
  }

  if (Array.isArray(input?.files)) {
    return normalizeBenchmarkEntries(
      input.files.flatMap((file) =>
        Array.isArray(file?.groups)
          ? file.groups.flatMap((group) =>
              Array.isArray(group?.benchmarks) ? group.benchmarks : [],
            )
          : [],
      ),
    );
  }

  if (input?.benchmarks && typeof input.benchmarks === "object") {
    return normalizeBenchmarkObject(input.benchmarks);
  }

  return normalizeBenchmarkObject(input);
}

function normalizeBenchmarkEntries(entries) {
  const results = {};

  for (const entry of entries) {
    const name = entry?.name;
    const hz = parseHz(entry?.hz);
    if (typeof name === "string" && Number.isFinite(hz)) {
      results[name] = { hz };
    }
  }

  return results;
}

function normalizeBenchmarkObject(input) {
  const results = {};

  for (const [name, value] of Object.entries(input)) {
    const hz = parseHz(value?.hz);
    if (Number.isFinite(hz)) {
      results[name] = { hz };
    }
  }

  return results;
}

function stripAnsi(input) {
  const escape = String.fromCharCode(27);
  return input.replace(new RegExp(`${escape}\\[[0-?]*[ -/]*[@-~]`, "gu"), "");
}

function parseHz(value) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return Number(value);
  }
  return Number.NaN;
}

function formatHz(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}
