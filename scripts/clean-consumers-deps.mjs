import { readdir, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";

/** Packages whose installations must be single and mutually compatible in a consumer. */
export function isEditorFamilyPackage(name) {
  return name === "@moenarch/editor-core" || /^@(moenarch|moritzbrantner)\/ui$/.test(name);
}

/**
 * Turns the installed copies of editor-family packages and npm's own dependency problems into
 * human-readable failures: duplicate copies, mismatched versions and invalid/missing peers.
 */
export function findEditorDependencyProblems({ copies, npmProblems = [] }) {
  const problems = [];
  const byName = new Map();
  for (const copy of copies) {
    byName.set(copy.name, [...(byName.get(copy.name) ?? []), copy]);
  }
  for (const [name, found] of byName) {
    if (found.length > 1) {
      problems.push(
        `${name} is installed ${found.length} times: ${found
          .map((copy) => `${copy.version} at ${copy.path}`)
          .join(", ")}`,
      );
    }
  }
  for (const problem of npmProblems) {
    if ([...byName.keys()].some((name) => problem.includes(name))) {
      problems.push(problem);
    }
  }
  return problems;
}

/** Finds every physical copy of an editor-family package under `dir/node_modules`. */
export async function collectEditorPackageCopies(dir) {
  const copies = [];
  const seen = new Set();

  async function visit(nodeModules) {
    let entries;
    try {
      entries = await readdir(nodeModules, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name.startsWith("@")) {
        const scopeDir = join(nodeModules, entry.name);
        for (const scoped of await readdir(scopeDir)) {
          await inspect(join(scopeDir, scoped));
        }
      } else if (!entry.name.startsWith(".")) {
        await inspect(join(nodeModules, entry.name));
      }
    }
  }

  async function inspect(packageDir) {
    const real = await realpath(packageDir).catch(() => null);
    if (!real || seen.has(real)) return;
    seen.add(real);
    const manifest = await readFile(join(real, "package.json"), "utf8")
      .then(JSON.parse)
      .catch(() => null);
    if (manifest && isEditorFamilyPackage(manifest.name)) {
      copies.push({ name: manifest.name, path: packageDir, version: manifest.version });
    }
    await visit(join(real, "node_modules"));
  }

  await visit(join(dir, "node_modules"));
  return copies;
}
