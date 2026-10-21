import { createEditorRuntime, type EditorRuntimeState } from "@moenarch/editor-core/runtime";
import { useEditorRuntime } from "@moenarch/editor-core/react";

export type TitleDocument = { title: string };

export function createTitleRuntime(title: string): EditorRuntimeState<TitleDocument> {
  return createEditorRuntime<TitleDocument>({ initialDocument: { title } });
}

/** A controlled editor: the host owns the runtime value and receives every change. */
export function TitleEditor(props: {
  value: EditorRuntimeState<TitleDocument>;
  onChange: (value: EditorRuntimeState<TitleDocument>) => void;
}) {
  const editor = useEditorRuntime<TitleDocument>({
    initialDocument: props.value.document,
    onChange: props.onChange,
    value: props.value,
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
