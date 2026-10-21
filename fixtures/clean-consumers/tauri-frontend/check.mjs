import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const assets = await readdir(new URL("dist/assets/", import.meta.url));
const script = assets.find((name) => name.endsWith(".js"));
assert.ok(script, "Tauri frontend build produced no script");
const bundle = await readFile(new URL(`dist/assets/${script}`, import.meta.url), "utf8");
assert.doesNotMatch(bundle, /["']node:[a-z]/, "frontend bundle references Node built-ins");
assert.match(bundle, /clean-consumer/, "editor session store was tree-shaken away");
console.log(`Tauri frontend built ${script} (${bundle.length} bytes)`);
