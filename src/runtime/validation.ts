import { countEditorTelemetryIssues } from "../telemetry.js";
import type { EditorRuntimeOptions, EditorRuntimeValidationIssue } from "./types.js";

export function validateRuntimeDocument<TDocument>(
  document: TDocument,
  options: Pick<EditorRuntimeOptions<TDocument>, "telemetry" | "validate">,
  revision: number,
): readonly EditorRuntimeValidationIssue[] {
  if (!options.validate) {
    return [];
  }
  const { telemetry } = options;
  const startedAt = telemetry?.now();
  const issues = options.validate(document);
  if (telemetry && startedAt !== undefined) {
    telemetry.emit(
      "validation.summary",
      { ...countEditorTelemetryIssues(issues), revision },
      { durationMs: telemetry.now() - startedAt },
    );
  }
  return issues;
}
