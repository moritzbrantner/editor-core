import { execFile } from "node:child_process";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(rootDir, "dist");
const reportPath = join(rootDir, "docs", "api-report.md");
const write = process.argv.includes("--write");
const execFileAsync = promisify(execFile);

const files = (await readdir(distDir))
  .filter((file) => file.endsWith(".d.ts"))
  .sort((left, right) => left.localeCompare(right));

const sections = await Promise.all(
  files.map(async (file) => {
    const content = await readFile(join(distDir, file), "utf8");
    return [`## ${file}`, "```ts", content.trim(), "```"].join("\n");
  }),
);

const report = await formatMarkdown(
  [
    "# API Report",
    "",
    "Generated from the public declaration files in `dist`. Run `bun run api:update` after intentional API changes.",
    "",
    "Review API-report diffs as release inputs: changed exported names, changed option shapes, changed defaults, and removed types should be reflected in `CHANGELOG.md`. While the package is in `0.x`, classify public API changes as patch or minor changes according to the semver policy in the changelog.",
    "",
    ...sections,
    "",
  ].join("\n"),
);

if (write) {
  await writeFile(reportPath, report);
  process.stdout.write(`Updated ${reportPath}\n`);
} else {
  const existing = await readFile(reportPath, "utf8").catch(() => null);
  if (existing !== report) {
    process.stderr.write(
      "API report is out of date. Run `bun run api:update` and review docs/api-report.md.\n",
    );
    process.exitCode = 1;
  }
}

async function formatMarkdown(markdown) {
  const tempDir = await mkdtemp(join(tmpdir(), "editor-core-api-report-"));
  const tempPath = join(tempDir, "api-report.md");
  try {
    await writeFile(tempPath, markdown);
    await execFileAsync(join(rootDir, "node_modules", ".bin", "oxfmt"), [tempPath]);
    return readFile(tempPath, "utf8");
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}
