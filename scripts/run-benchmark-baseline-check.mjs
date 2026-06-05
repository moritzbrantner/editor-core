import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBenchmarkBaselines, parseBenchmarkResults } from "./check-benchmark-baselines.mjs";
import { readFile } from "node:fs/promises";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const resultsPath = join(rootDir, "benchmark-results", "vitest-bench.txt");
const baselinePath = join(rootDir, "docs", "performance-baselines.json");
const node = process.execPath;
const vitest = join(rootDir, "node_modules", "vitest", "vitest.mjs");

const output = await runBenchmark();
await mkdir(dirname(resultsPath), { recursive: true });
await writeFile(resultsPath, output);

const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const failures = checkBenchmarkBaselines(parseBenchmarkResults(output), baseline);
if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
}

async function runBenchmark() {
  return new Promise((resolveOutput, reject) => {
    const child = spawn(node, [vitest, "bench", "--run"], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";

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
      if (code === 0) {
        resolveOutput(output);
      } else {
        reject(new Error(`Benchmark command exited with code ${code}.`));
      }
    });
  });
}
