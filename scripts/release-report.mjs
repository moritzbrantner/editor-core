// Release report: public API, export map, packed files and per-entrypoint sizes compared
// against docs/release-baseline.json. Additions are reported; removals, export-map changes
// and size-budget regressions fail. `--write` updates the baseline intentionally.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export const REPORT_SCHEMA_VERSION = 1;
const DEFAULT_BUDGET = { tolerancePercent: 5, toleranceBytes: 512 };

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(rootDir, "docs", "release-baseline.json");
const outDir = join(rootDir, "test-results", "release-report");

export function entrypointKind(subpath) {
  if (subpath === ".") return "root";
  if (subpath === "./react") return "react";
  if (subpath === "./browser") return "browser";
  if (subpath === "./testing" || subpath === "./conformance") return "optional";
  return "core";
}

const normalizePackedPath = (path) => path.replace(/-[A-Za-z0-9_-]{8}(\.d\.ts|\.js)$/, "-[hash]$1");

/** Collects the current package facts from the built `dist` and `npm pack --dry-run`. */
export async function collect() {
  const ts = (await import("typescript")).default;
  const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
  const exportMap = Object.fromEntries(
    Object.entries(pkg.exports).map(([subpath, target]) => [subpath, JSON.stringify(target)]),
  );
  const entries = Object.entries(pkg.exports).map(([subpath, target]) => ({
    subpath,
    js: join(rootDir, target.import),
    dts: join(rootDir, target.types),
  }));

  const program = ts.createProgram(
    entries.map((entry) => entry.dts),
    { noEmit: true, skipLibCheck: true, types: [] },
  );
  const checker = program.getTypeChecker();

  const entrypoints = {};
  for (const entry of entries) {
    const source = program.getSourceFile(entry.dts);
    const moduleSymbol = source && checker.getSymbolAtLocation(source);
    const api = {};
    for (const symbol of moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : []) {
      const target =
        symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      const text = (target.declarations ?? [])
        .map((declaration) => declaration.getText().replace(/\s+/g, " "))
        .join("\n");
      api[symbol.name] = createHash("sha256").update(text).digest("hex").slice(0, 16);
    }
    entrypoints[entry.subpath] = {
      kind: entrypointKind(entry.subpath),
      api: Object.fromEntries(Object.entries(api).sort(([a], [b]) => a.localeCompare(b))),
      jsGzipBytes: moduleClosureBytes(entry.js, (path) => gzipSync(readFileSync(path)).length),
      dtsBytes: moduleClosureBytes(entry.dts, (path) => readFileSync(path).length),
    };
  }

  const packOutput = JSON.parse(
    execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  const packed = Array.isArray(packOutput) ? packOutput[0] : Object.values(packOutput)[0];
  const packedFiles = {};
  for (const file of packed.files) {
    const key = normalizePackedPath(file.path);
    packedFiles[key] = (packedFiles[key] ?? 0) + 1;
  }

  return {
    exportMap,
    entrypoints,
    packedFiles: Object.fromEntries(
      Object.entries(packedFiles).sort(([a], [b]) => a.localeCompare(b)),
    ),
    packedBytes: packed.size,
    unpackedBytes: packed.unpackedSize,
  };
}

/** Sums `measure` over a dist file and every relative module it statically imports. */
function moduleClosureBytes(entryPath, measure) {
  const seen = new Set();
  const pending = [entryPath];
  let total = 0;
  while (pending.length > 0) {
    const path = pending.pop();
    if (seen.has(path) || !existsSync(path)) continue;
    seen.add(path);
    total += measure(path);
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/(?:from|import)\s*["'](\.\/[^"']+)["']/g)) {
      const specifier = match[1];
      const resolved = join(dirname(path), specifier);
      pending.push(path.endsWith(".d.ts") ? resolved.replace(/\.js$/, ".d.ts") : resolved);
    }
  }
  return total;
}

/** Compares current package facts with the committed baseline. Pure; used by tests. */
export function compare(baseline, current) {
  const budget = { ...DEFAULT_BUDGET, ...baseline.budget };
  const failures = [];
  const entrypoints = [];

  const exportMap = { added: [], removed: [], changed: [] };
  for (const [subpath, target] of Object.entries(current.exportMap)) {
    if (!(subpath in baseline.exportMap)) exportMap.added.push(subpath);
    else if (baseline.exportMap[subpath] !== target) exportMap.changed.push(subpath);
  }
  for (const subpath of Object.keys(baseline.exportMap)) {
    if (!(subpath in current.exportMap)) exportMap.removed.push(subpath);
  }
  for (const subpath of exportMap.removed) failures.push(`export map: removed ${subpath}`);
  for (const subpath of exportMap.changed) failures.push(`export map: changed ${subpath}`);

  for (const [subpath, entry] of Object.entries(current.entrypoints)) {
    const previous = baseline.entrypoints[subpath];
    const api = { added: [], removed: [], changed: [] };
    for (const [name, hash] of Object.entries(entry.api)) {
      if (!previous || !(name in previous.api)) api.added.push(name);
      else if (previous.api[name] !== hash) api.changed.push(name);
    }
    for (const name of Object.keys(previous?.api ?? {})) {
      if (!(name in entry.api)) api.removed.push(name);
    }
    for (const name of api.removed) failures.push(`${subpath}: removed export ${name}`);

    const sizes = {};
    for (const metric of ["jsGzipBytes", "dtsBytes"]) {
      const before = previous?.[metric];
      const after = entry[metric];
      const limit =
        before === undefined
          ? undefined
          : Math.max(
              Math.round(before * (1 + budget.tolerancePercent / 100)),
              before + budget.toleranceBytes,
            );
      sizes[metric] = { before, after, limit };
      if (limit !== undefined && after > limit) {
        failures.push(`${subpath}: ${metric} ${before} -> ${after} exceeds budget ${limit}`);
      }
    }
    entrypoints.push({ subpath, kind: entry.kind, api, sizes });
  }

  const packedFiles = { added: [], removed: [] };
  for (const path of Object.keys(current.packedFiles)) {
    if (!(path in baseline.packedFiles)) packedFiles.added.push(path);
  }
  for (const path of Object.keys(baseline.packedFiles)) {
    if (!(path in current.packedFiles)) packedFiles.removed.push(path);
  }

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    ok: failures.length === 0,
    failures,
    budget,
    exportMap,
    entrypoints,
    packedFiles,
    packedBytes: { before: baseline.packedBytes, after: current.packedBytes },
    unpackedBytes: { before: baseline.unpackedBytes, after: current.unpackedBytes },
  };
}

export function toMarkdown(report) {
  const list = (items) => (items.length > 0 ? items.join(", ") : "none");
  const delta = ({ before, after }) =>
    before === undefined
      ? `${after} (new)`
      : `${before} -> ${after} (${after - before >= 0 ? "+" : ""}${after - before})`;
  const lines = [
    "# Release report",
    "",
    report.ok ? "Result: **pass**" : "Result: **fail**",
    "",
    ...report.failures.map((failure) => `- FAIL ${failure}`),
    "",
    "## Export map",
    "",
    `- Added: ${list(report.exportMap.added)}`,
    `- Removed: ${list(report.exportMap.removed)}`,
    `- Changed: ${list(report.exportMap.changed)}`,
    "",
    "## Entrypoints",
    "",
    "| Entrypoint | Kind | JS gzip bytes | d.ts bytes | Added | Removed | Changed signatures |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.entrypoints.map(
      (entry) =>
        `| \`${entry.subpath}\` | ${entry.kind} | ${delta(entry.sizes.jsGzipBytes)} | ${delta(entry.sizes.dtsBytes)} | ${list(entry.api.added)} | ${list(entry.api.removed)} | ${list(entry.api.changed)} |`,
    ),
    "",
    "## Packed files",
    "",
    `- Tarball bytes: ${delta(report.packedBytes)}`,
    `- Unpacked bytes: ${delta(report.unpackedBytes)}`,
    `- Added: ${list(report.packedFiles.added)}`,
    `- Removed: ${list(report.packedFiles.removed)}`,
    "",
  ];
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const current = await collect();
  if (process.argv.includes("--write")) {
    const previous = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : {};
    const baseline = {
      schemaVersion: REPORT_SCHEMA_VERSION,
      budget: previous.budget ?? DEFAULT_BUDGET,
      ...current,
    };
    writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    process.stdout.write(`Updated ${baselinePath}\n`);
  } else {
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    const report = compare(baseline, current);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "release-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    const markdown = toMarkdown(report);
    writeFileSync(join(outDir, "release-report.md"), markdown);
    process.stdout.write(markdown);
    if (!report.ok) {
      process.stderr.write(
        "\nRelease report failed. If the change is intentional, run `bun run release:baseline` and note it in CHANGELOG.md.\n",
      );
      process.exitCode = 1;
    }
  }
}
