import { useState } from "react";
import { useEditorRuntime } from "@moenarch/editor-core/react";
import { createEditorRuntime } from "@moenarch/editor-core/runtime";

export function App({ initialTitle = "Vite draft" }) {
  const [runtime, setRuntime] = useState(() =>
    createEditorRuntime({ initialDocument: { title: initialTitle } }),
  );
  const editor = useEditorRuntime({
    initialDocument: runtime.document,
    onChange: setRuntime,
    value: runtime,
  });
  return (
    <label data-status={editor.state.status}>
      Title
      <input
        value={editor.state.document.title}
        onChange={(event) => editor.commit({ title: event.currentTarget.value })}
      />
    </label>
  );
}
