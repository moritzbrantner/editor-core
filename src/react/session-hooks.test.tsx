import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import { useEditorSession } from "../react.js";
import { commitEditorRuntime, createEditorRuntime } from "../runtime.js";
import { createEditorSession, createMemoryEditorSessionStore } from "../session.js";

test("useEditorSession re-renders on session changes", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const session = createEditorSession<{ title: string }>({
    autosave: false,
    codec: { parse: (payload) => payload as { title: string } },
    runtime: createEditorRuntime({ initialDocument: { title: "Draft" } }),
    store: createMemoryEditorSessionStore(),
  });
  function Status() {
    const state = useEditorSession(session);
    return <output>{`${state.runtime.document.title}:${state.lifecycle}`}</output>;
  }
  const container = document.createElement("div");
  const root = createRoot(container);

  act(() => root.render(<Status />));
  expect(container.textContent).toBe("Draft:idle");

  act(() => session.update((runtime) => commitEditorRuntime(runtime, { title: "Edited" })));
  expect(container.textContent).toBe("Edited:dirty");
  act(() => root.unmount());
});
