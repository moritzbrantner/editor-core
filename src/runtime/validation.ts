import type { EditorRuntimeOptions, EditorRuntimeValidationIssue } from "./types.js";

export function validateRuntimeDocument<TDocument>(
  document: TDocument,
  options: Pick<EditorRuntimeOptions<TDocument>, "validate">,
): readonly EditorRuntimeValidationIssue[] {
  return options.validate?.(document) ?? [];
}
