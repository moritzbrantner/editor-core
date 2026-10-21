import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL(".next/server/app/index.html", import.meta.url), "utf8");
assert.match(html, /data-server-document[^>]*>\{&quot;title&quot;:&quot;Server draft&quot;\}/);
assert.match(html, /data-status="clean"/);
assert.match(html, /value="Server draft"/);
console.log("Next.js built a server page from core entrypoints with a client editor island");
