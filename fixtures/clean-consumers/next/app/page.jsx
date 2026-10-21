// React Server Component: only headless core entrypoints may load here.
import { stableEditorJsonStringify } from "@moenarch/editor-core";
import { createEditorRuntime } from "@moenarch/editor-core/runtime";
import { TitleEditor } from "./title-editor.jsx";

export default function Page() {
  const runtime = createEditorRuntime({ initialDocument: { title: "Server draft" } });
  return (
    <main>
      <pre data-server-document>{stableEditorJsonStringify(runtime.document)}</pre>
      <TitleEditor initialTitle={runtime.document.title} />
    </main>
  );
}
