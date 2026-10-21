import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { render } from "./dist-server/entry-server.js";

const html = render();
assert.match(html, /data-status="clean"/);
assert.match(html, /value="Vite draft"/);

const assets = await readdir(new URL("dist/assets/", import.meta.url));
const bundle = await readFile(
  new URL(`dist/assets/${assets.find((name) => name.endsWith(".js"))}`, import.meta.url),
  "utf8",
);
assert.doesNotMatch(bundle, /["']node:[a-z]/, "client bundle references Node built-ins");
console.log("Vite + React built the client bundle and rendered:", html);
