import { pathToFileURL } from "node:url";

export function requireNodeMajor(version, expectedMajor) {
  const actualMajor = Number.parseInt(String(version).split(".")[0] ?? "", 10);
  if (actualMajor !== expectedMajor) {
    throw new Error(
      `Node ${expectedMajor} is required for the package smoke check; received ${version}.`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  requireNodeMajor(process.versions.node, 24);
  await import("./smoke-package-exports.mjs");
}
