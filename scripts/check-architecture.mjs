import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { architectureRules } from "./architecture-rules.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv.includes("--check") ? "check" : "report";
  const result = await checkArchitecture({ mode, rootDir });
  printArchitectureResult(result);
  if (mode === "check" && result.errors.length > 0) {
    process.exitCode = 1;
  }
}

export async function checkArchitecture(options = {}) {
  const mode = options.mode ?? "report";
  const root = options.rootDir ?? rootDir;
  const src = join(root, "src");
  const files = (await listSourceFiles(src)).sort((left, right) => left.localeCompare(right));
  const implementationFiles = files.filter((file) => !isTestFile(file));
  const lineCounts = await getLineCounts(files);
  const parsedFiles = new Map();
  const errors = [];
  const warnings = [];

  for (const file of implementationFiles) {
    const content = await readFile(file, "utf8");
    const relativePath = toRepoPath(root, file);
    const domain = getDomain(relative(src, file));
    const parsed = parseModuleReferences(content);
    parsedFiles.set(file, { content, domain, references: parsed, relativePath });

    checkFileSize({
      errors,
      file,
      lineCounts,
      mode,
      relativePath,
      warnings,
    });
    checkPublicEntrypoint({
      content,
      domain,
      errors,
      relativePath,
    });
    checkRootReactExport({ content, errors, relativePath });
  }

  const graph = new Map(implementationFiles.map((file) => [file, new Set()]));

  for (const [file, parsed] of parsedFiles) {
    for (const reference of parsed.references) {
      if (reference.specifier === "react" || reference.specifier === "react-dom") {
        if (parsed.domain !== "react") {
          errors.push({
            file: parsed.relativePath,
            message: `React import is only allowed inside the react domain: ${reference.specifier}`,
          });
        }
        continue;
      }

      if (reference.specifier.startsWith("@moritzbrantner/editor-core")) {
        errors.push({
          file: parsed.relativePath,
          message: `Source files must not self-import the package: ${reference.specifier}`,
        });
        continue;
      }

      if (!reference.specifier.startsWith(".")) {
        continue;
      }

      const target = resolveLocalModule(src, file, reference.specifier, parsedFiles);
      if (!target || !parsedFiles.has(target)) {
        continue;
      }

      graph.get(file)?.add(target);

      const targetRelative = relative(src, target).replaceAll("\\", "/");
      const targetDomain = getDomain(targetRelative);
      if (targetRelative === "index.ts" || targetRelative === "index.tsx") {
        errors.push({
          file: parsed.relativePath,
          message: "Source files must not import from src/index.",
        });
      }

      if (parsed.domain !== targetDomain) {
        if (!isDomainEntrypoint(targetRelative, targetDomain)) {
          errors.push({
            file: parsed.relativePath,
            message: `Cross-domain imports must use ${targetDomain}'s public entrypoint: ${reference.specifier}`,
          });
        }

        if (!reference.typeOnly) {
          const allowed = architectureRules.valueDependencies[parsed.domain] ?? [];
          if (!allowed.includes(targetDomain)) {
            errors.push({
              file: parsed.relativePath,
              message: `Value import from ${parsed.domain} to ${targetDomain} is not allowed: ${reference.specifier}`,
            });
          }
        }
      }
    }
  }

  for (const cycle of findCycles(graph)) {
    errors.push({
      file: toRepoPath(root, cycle[0]),
      message: `Import cycle detected: ${cycle.map((file) => toRepoPath(root, file)).join(" -> ")}`,
    });
  }

  return { errors, mode, warnings };
}

export function printArchitectureResult(result) {
  for (const warning of result.warnings) {
    process.stdout.write(`warning ${warning.file}: ${warning.message}\n`);
  }
  for (const error of result.errors) {
    process.stdout.write(`error ${error.file}: ${error.message}\n`);
  }
  if (result.errors.length === 0 && result.warnings.length === 0) {
    process.stdout.write("Architecture check passed with no findings.\n");
    return;
  }
  process.stdout.write(
    `Architecture ${result.mode} completed with ${result.errors.length} error(s) and ${result.warnings.length} warning(s).\n`,
  );
}

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(path)));
      continue;
    }
    if (entry.isFile() && [".ts", ".tsx"].includes(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

function parseModuleReferences(content) {
  const references = [];
  const importPattern = /import\s+(type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["'];/g;
  const exportPattern = /export\s+(?:type\s+)?(?:\*|\{[\s\S]*?\})\s+from\s+["']([^"']+)["'];/g;

  for (const match of content.matchAll(importPattern)) {
    references.push({
      specifier: match[2],
      typeOnly: Boolean(match[1]) || isNamedTypeOnlyImport(match[0]),
    });
  }
  for (const match of content.matchAll(exportPattern)) {
    references.push({ specifier: match[1], typeOnly: false });
  }

  return references;
}

function isNamedTypeOnlyImport(statement) {
  const named = statement.match(/\{([\s\S]*?)\}/);
  if (!named) {
    return false;
  }
  return named[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .every((part) => part.startsWith("type "));
}

function resolveLocalModule(src, fromFile, specifier, parsedFiles) {
  const base = resolve(dirname(fromFile), specifier.replace(/\.js$/, ""));
  const candidates = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
  return candidates.find((candidate) => candidate.startsWith(src) && parsedFiles.has(candidate));
}

function getDomain(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  const first = normalized.split("/")[0];
  return first.replace(/\.(ts|tsx)$/, "");
}

function isDomainEntrypoint(targetRelative, targetDomain) {
  return targetRelative === `${targetDomain}.ts` || targetRelative === `${targetDomain}.tsx`;
}

function checkFileSize({ errors, file, lineCounts, mode, relativePath, warnings }) {
  if (isTestFile(file)) {
    return;
  }
  const lineCount = lineCounts.get(file);
  const count = lineCount ?? 0;
  if (count > architectureRules.fileSize.hardLimit) {
    errors.push({
      file: relativePath,
      message: `File has ${count} lines; hard limit is ${architectureRules.fileSize.hardLimit}.`,
    });
    return;
  }
  if (count > architectureRules.fileSize.softLimit) {
    warnings.push({
      file: relativePath,
      message: `File has ${count} lines; soft split signal is ${architectureRules.fileSize.softLimit}.`,
    });
  }
  void mode;
}

function checkPublicEntrypoint({ content, domain, errors, relativePath }) {
  if (!architectureRules.splitDomains.includes(domain)) {
    return;
  }
  if (relativePath !== `src/${domain}.ts` && relativePath !== `src/${domain}.tsx`) {
    return;
  }
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const valid = lines.every((line) =>
    /^export\s+(?:\*|\{[\s\S]*\}|type\s+\{[\s\S]*\})\s+from\s+["']\.\/.+\.js["'];$/.test(line),
  );
  if (!valid) {
    errors.push({
      file: relativePath,
      message: "Split domain entrypoints must contain only re-exports.",
    });
  }
  if (lines.length > 80) {
    errors.push({
      file: relativePath,
      message: "Split domain entrypoints must stay under 80 lines.",
    });
  }
}

function checkRootReactExport({ content, errors, relativePath }) {
  if (relativePath !== "src/index.ts") {
    return;
  }
  if (content.includes('from "./react.js"') || content.includes("from './react.js'")) {
    errors.push({
      file: relativePath,
      message: "The headless root entrypoint must not export React APIs.",
    });
  }
}

function findCycles(graph) {
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const seen = new Set();

  function visit(node) {
    if (visiting.has(node)) {
      const cycle = stack.slice(stack.indexOf(node)).concat(node);
      const key = cycle.join(">");
      if (!seen.has(key)) {
        seen.add(key);
        cycles.push(cycle);
      }
      return;
    }
    if (visited.has(node)) {
      return;
    }

    visiting.add(node);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      visit(next);
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of graph.keys()) {
    visit(node);
  }

  return cycles;
}

function isTestFile(file) {
  return /\.(test|spec)\.tsx?$/.test(file);
}

function toRepoPath(root, file) {
  return relative(root, file).replaceAll("\\", "/");
}

async function getLineCounts(files) {
  const counts = new Map();
  for (const file of files) {
    const content = await readFile(file, "utf8");
    counts.set(file, content.split(/\r?\n/).length);
  }
  return counts;
}
