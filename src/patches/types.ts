export type EditorPatchPath = readonly (string | number)[];

export type EditorPatchOperation =
  | { op: "add"; path: EditorPatchPath; value: unknown }
  | { op: "remove"; path: EditorPatchPath; oldValue?: unknown }
  | { op: "replace"; path: EditorPatchPath; value: unknown; oldValue?: unknown };

export type EditorPatch = readonly EditorPatchOperation[];

export type DiffEditorJsonOptions = {
  equals?: (left: unknown, right: unknown) => boolean;
  includeOldValues?: boolean;
};

export type ApplyEditorPatchOptions = {
  strict?: boolean;
};
