import { isTauri } from "@tauri-apps/api/core";
import { useEditorSession } from "@moenarch/editor-core/react";
import { createEditorRuntime, commitEditorRuntime } from "@moenarch/editor-core/runtime";
import {
  createEditorSession,
  createLocalStorageEditorSessionStore,
} from "@moenarch/editor-core/session";
import { createRoot } from "react-dom/client";

const session = createEditorSession({
  codec: { parse: (payload) => ({ title: String(payload.title) }) },
  runtime: createEditorRuntime({ initialDocument: { title: "Tauri draft" } }),
  store: createLocalStorageEditorSessionStore({ key: "clean-consumer" }),
});

function App() {
  const state = useEditorSession(session);
  return (
    <label data-lifecycle={state.lifecycle} data-shell={isTauri() ? "tauri" : "browser"}>
      Title
      <input
        value={state.runtime.document.title}
        onChange={(event) =>
          session.update((runtime) =>
            commitEditorRuntime(runtime, { title: event.currentTarget.value }),
          )
        }
      />
    </label>
  );
}

void session.load();
createRoot(document.getElementById("root")).render(<App />);
