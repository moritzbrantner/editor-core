import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  findComparisonFailures,
  runComparisonThroughMoonlightHttp,
} from "./stable-comparison-harness.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageName = "@moritzbrantner/editor-core";
const defaultStableSpecifier = `${packageName}@latest`;
const resultsDir = join(rootDir, "benchmark-results", "stable-comparison");
const stableInstallDir = join(resultsDir, "published-package");
const reportPath = join(resultsDir, "report.json");

const options = parseOptions(process.argv.slice(2));
const stableSpecifier =
  options.stable ?? process.env.EDITOR_CORE_STABLE_PACKAGE ?? defaultStableSpecifier;
const maxRegressionRatio = parseRatio(
  options.maxRegressionRatio ?? process.env.EDITOR_CORE_STABLE_MAX_REGRESSION_RATIO,
  0.5,
);
const minDurationMs = parsePositiveInteger(
  options.minDurationMs ?? process.env.EDITOR_CORE_STABLE_MIN_DURATION_MS,
  100,
);

await assertLocalBuildExists();
const stablePackageDir = await installStablePackage(stableSpecifier);
const [localPackage, stablePackage, localApi, stableApi] = await Promise.all([
  readPackageJson(join(rootDir, "package.json")),
  readPackageJson(join(stablePackageDir, "package.json")),
  import(pathToFileURL(join(rootDir, "dist", "index.js")).href),
  import(pathToFileURL(join(stablePackageDir, "dist", "index.js")).href),
]);

const result = await runComparisonThroughMoonlightHttp({
  localApi,
  maxRegressionRatio,
  minDurationMs,
  stableApi,
});

const report = {
  ...result,
  local: {
    path: rootDir,
    version: localPackage.version,
  },
  stable: {
    specifier: stableSpecifier,
    version: stablePackage.version,
  },
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

printReport(report);

const failures = findComparisonFailures(report);
if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
}

async function assertLocalBuildExists() {
  try {
    await readFile(join(rootDir, "dist", "index.js"), "utf8");
  } catch {
    throw new Error("Missing dist/index.js. Run `bun run build` before stable comparison.");
  }
}

async function installStablePackage(specifier) {
  await rm(stableInstallDir, { force: true, recursive: true });
  await mkdir(stableInstallDir, { recursive: true });
  await writeFile(
    join(stableInstallDir, "package.json"),
    `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`,
  );
  await runCommand(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", specifier],
    stableInstallDir,
  );
  return join(stableInstallDir, "node_modules", packageName);
}

async function readPackageJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function runCommand(command, args, cwd) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolveCommand();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}.`));
    });
  });
}

function printReport(report) {
  process.stdout.write(
    `Compared local ${packageName}@${report.local.version} against published ${report.stable.specifier} (${report.stable.version}).\n`,
  );
  process.stdout.write(
    `Performance budget: local must be within ${Math.round(
      report.maxRegressionRatio * 100,
    )}% of published stable.\n\n`,
  );

  for (const scenario of report.scenarios) {
    process.stdout.write(
      `${scenario.correct && scenario.performanceOk ? "PASS" : "FAIL"} ${scenario.name}: local ${formatHz(
        scenario.localHz,
      )} hz, stable ${formatHz(scenario.stableHz)} hz, ratio ${scenario.ratio.toFixed(2)}x\n`,
    );
  }

  process.stdout.write(`\nReport written to ${reportPath}\n`);
}

function parseOptions(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--stable") {
      parsed.stable = args[index + 1];
      index += 1;
    } else if (arg === "--max-regression-ratio") {
      parsed.maxRegressionRatio = args[index + 1];
      index += 1;
    } else if (arg === "--min-duration-ms") {
      parsed.minDurationMs = args[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function parseRatio(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, 0), 0.95);
}

function parsePositiveInteger(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function formatHz(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}
