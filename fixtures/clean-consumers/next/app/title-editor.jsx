"use client";

import { useEditorRuntime } from "@moenarch/editor-core/react";

export function TitleEditor({ initialTitle }) {
  const editor = useEditorRuntime({ initialDocument: { title: initialTitle } });
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
