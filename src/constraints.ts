import type { EditorEntityId, EditorTimelineRange } from "./entities.js";
import type { EditorParseIssue } from "./serialization.js";

export type EditorConstraintIssueOptions = {
  entityId?: EditorEntityId;
  message: string;
  path?: string;
};

export type EditorGraphConnection = {
  sourceId: EditorEntityId;
  sourcePortId?: string;
  targetId: EditorEntityId;
  targetPortId?: string;
};

export type ValidateEditorGraphConnectionOptions = {
  allowSelfConnection?: boolean;
  canConnect?: (connection: EditorGraphConnection) => boolean;
  path?: string;
};

export type ValidateEditorTimelineRangeOptions = {
  allowZeroDuration?: boolean;
  max?: number;
  min?: number;
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

export function validateEditorGraphConnection(
  connection: EditorGraphConnection,
  options: ValidateEditorGraphConnectionOptions = {},
): readonly EditorParseIssue[] {
  const path = options.path ?? "connection";
  if (options.allowSelfConnection !== true && connection.sourceId === connection.targetId) {
    return [{ path, message: "Connections must target a different entity." }];
  }

  if (options.canConnect && !options.canConnect(connection)) {
    return [{ path, message: "Connection is not allowed." }];
  }

  return [];
}

export function validateEditorTimelineRange(
  range: EditorTimelineRange,
  options: ValidateEditorTimelineRangeOptions = {},
): readonly EditorParseIssue[] {
  const path = options.path ?? "range";
  const issues: EditorParseIssue[] = [];
  if (options.allowZeroDuration === true ? range.end < range.start : range.end <= range.start) {
    issues.push({ path, message: "Range end must be after range start." });
  }
  if (options.min !== undefined && range.start < options.min) {
    issues.push({ path: `${path}.start`, message: `Range start must be at least ${options.min}.` });
  }
  if (options.max !== undefined && range.end > options.max) {
    issues.push({ path: `${path}.end`, message: `Range end must be at most ${options.max}.` });
  }
  return issues;
}

export function clampEditorTimelineRange(
  range: EditorTimelineRange,
  options: Pick<ValidateEditorTimelineRangeOptions, "max" | "min"> = {},
): EditorTimelineRange {
  const min = options.min ?? -Infinity;
  const max = options.max ?? Infinity;
  const start = Math.min(max, Math.max(min, range.start));
  const end = Math.min(max, Math.max(start, range.end));
  return { end, start };
}
