import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { TitleEditor, createTitleRuntime } from "./dist/TitleEditor.js";

const html = renderToString(
  createElement(TitleEditor, { onChange() {}, value: createTitleRuntime("Library draft") }),
);

assert.match(html, /data-status="clean"/);
assert.match(html, /value="Library draft"/);
console.log("React library compiled against packed types and rendered:", html);
