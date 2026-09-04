import type { EditorEntityId } from "./entities.js";
import type { EditorParseIssue } from "./serialization.js";

export type EditorConstraintIssueOptions = {
  entityId?: EditorEntityId;
  message: string;
  path?: string;
};

export function createEditorConstraintIssue(
  options: EditorConstraintIssueOptions,
): EditorParseIssue {
  return {
    message: options.message,
    path: options.path ?? (options.entityId ? `entities.${options.entityId}` : ""),
  };
}

export function validateEditorEntityIssues<TEntity>(
  entities: readonly TEntity[],
  validate: (entity: TEntity) => readonly EditorParseIssue[],
): readonly EditorParseIssue[] {
  return entities.flatMap((entity) => validate(entity));
}
