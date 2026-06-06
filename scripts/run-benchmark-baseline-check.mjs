import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkBenchmarkBaselines,
  mergeBenchmarkResultsBest,
  parseBenchmarkResults,
} from "./check-benchmark-baselines.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const resultsDir = join(rootDir, "benchmark-results");
const resultsPath = join(resultsDir, "vitest-bench.txt");
const baselinePath = join(rootDir, "docs", "performance-baselines.json");
const node = process.execPath;
const vitest = join(rootDir, "node_modules", "vitest", "vitest.mjs");
const attemptCount = getBenchmarkAttemptCount(process.env.EDITOR_CORE_BENCH_ATTEMPTS);

await mkdir(dirname(resultsPath), { recursive: true });

const attemptOutputs = [];
let aggregateResults = {};

try {
  for (let attempt = 1; attempt <= attemptCount; attempt += 1) {
    const jsonPath = join(resultsDir, `vitest-bench-attempt-${attempt}.json`);
    const { output, exitCode } = await runBenchmarkAttempt(attempt, jsonPath);
    attemptOutputs.push(`# Benchmark attempt ${attempt}\n\n${output.trimEnd()}\n`);

    if (exitCode !== 0) {
      throw new Error(`Benchmark command exited with code ${exitCode}.`);
    }

    const attemptResults = parseBenchmarkResults(await readFile(jsonPath, "utf8"));
    aggregateResults = mergeBenchmarkResultsBest(aggregateResults, attemptResults);
  }
} finally {
  await writeFile(resultsPath, attemptOutputs.join("\n"));
}

const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const failures = checkBenchmarkBaselines(aggregateResults, baseline);
if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
}

function getBenchmarkAttemptCount(value) {
  if (value === undefined) {
    return 2;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return 2;
  }

  return Math.min(Math.max(parsed, 1), 5);
}

async function runBenchmarkAttempt(attempt, jsonPath) {
  return new Promise((resolveAttempt, reject) => {
    const child = spawn(node, [vitest, "bench", "--run", "--outputJson", jsonPath], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";

    process.stdout.write(`# Benchmark attempt ${attempt}\n\n`);
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      output += text;
      process.stderr.write(text);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolveAttempt({ exitCode: code ?? 1, output });
    });
  });
}
