// Installs the packed package into fresh consumer apps (fixtures/clean-consumers/*) and runs each
// fixture's `check` script. Usage: node scripts/clean-consumers.mjs [--tarball <file.tgz>]
// [--only core-node,next] [--logs <dir>] [--keep]. Without --tarball the built package is packed.
import { spawn } from "node:child_process";
import { appendFile, cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  collectEditorPackageCopies,
  findEditorDependencyProblems,
} from "./clean-consumers-deps.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = join(rootDir, "fixtures", "clean-consumers");
const candidatePlaceholder = "candidate";

const { values } = parseArgs({
  options: {
    keep: { type: "boolean", default: false },
    logs: { type: "string", default: join(rootDir, "test-results", "clean-consumers") },
    only: { type: "string" },
    tarball: { type: "string" },
  },
});

const logsDir = resolve(values.logs);
const workDir = await mkdtemp(join(tmpdir(), "editor-core-consumers-"));
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", npm_config_dry_run: "false" };
await rm(logsDir, { force: true, recursive: true });
await mkdir(logsDir, { recursive: true });

const failures = [];
try {
  const tarball = values.tarball ? resolve(values.tarball) : await packCandidate();
  const fixtures = (await readdir(fixturesDir)).filter(
    (name) => !values.only || values.only.split(",").includes(name),
  );
  if (fixtures.length === 0) {
    throw new Error(`No clean-consumer fixtures match --only ${values.only}`);
  }

  for (const fixture of fixtures) {
    const log = join(logsDir, `${fixture}.log`);
    const started = Date.now();
    try {
      await runFixture(fixture, tarball, log);
      console.log(`ok   ${fixture} (${Math.round((Date.now() - started) / 1000)}s)`);
    } catch (error) {
      failures.push(fixture);
      await appendFile(log, `\nFAILED: ${error.message}\n`);
      console.error(`FAIL ${fixture}: ${error.message}\n  log: ${log}`);
      console.error(tail(await readFile(log, "utf8"), 40));
    }
  }
} finally {
  if (!values.keep) {
    await rm(workDir, { force: true, recursive: true });
  } else {
    console.log(`kept consumer apps in ${workDir}`);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} clean-consumer fixture(s) failed: ${failures.join(", ")}`);
  process.exit(1);
}

async function packCandidate() {
  const packDir = join(workDir, "candidate");
  await mkdir(packDir);
  const output = await run("npm", ["pack", "--pack-destination", packDir], {
    cwd: rootDir,
    log: join(logsDir, "pack.log"),
  });
  return join(packDir, output.trim().split("\n").at(-1));
}

async function runFixture(fixture, tarball, log) {
  const appDir = join(workDir, fixture);
  await cp(join(fixturesDir, fixture), appDir, { recursive: true });

  const manifestPath = join(appDir, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const field of ["dependencies", "devDependencies"]) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      if (version === candidatePlaceholder) {
        manifest[field][name] = `file:${tarball}`;
      }
    }
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  await run("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts"], {
    cwd: appDir,
    log,
  });
  await assertSingleEditorInstall(appDir, log);
  await run("npm", ["run", "--silent", "check"], { cwd: appDir, log });
}

async function assertSingleEditorInstall(appDir, log) {
  const listing = await run("npm", ["ls", "--all", "--json"], {
    allowFailure: true,
    cwd: appDir,
    log,
    quiet: true,
  });
  let npmProblems = [];
  try {
    npmProblems = JSON.parse(listing).problems ?? [];
  } catch {
    // npm printed no JSON; the copy scan below still runs.
  }
  const copies = await collectEditorPackageCopies(appDir);
  const problems = findEditorDependencyProblems({ copies, npmProblems });
  await appendFile(
    log,
    `\n$ dependency assertion\n${copies.map((copy) => `${copy.name}@${copy.version} ${copy.path}`).join("\n")}\n`,
  );
  if (!copies.some((copy) => copy.name === "@moenarch/editor-core")) {
    problems.push("@moenarch/editor-core is not installed");
  }
  if (problems.length > 0) {
    throw new Error(`dependency assertion failed:\n  ${problems.join("\n  ")}`);
  }
}

function run(command, args, { allowFailure = false, cwd, log, quiet = false }) {
  return new Promise((resolvePromise, reject) => {
    let stdout = "";
    let output = `\n$ ${command} ${args.join(" ")}  (in ${cwd})\n`;
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!quiet) output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", async (code) => {
      await appendFile(log, output);
      if (code !== 0 && !allowFailure) {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      } else {
        resolvePromise(stdout);
      }
    });
  });
}

function tail(text, lines) {
  return text.split("\n").slice(-lines).join("\n");
}
