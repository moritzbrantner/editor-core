import { isEditorRecord } from "../json.js";
import { EditorJsonParseError, type EditorParseIssue } from "../serialization.js";
import { migrateEditorOperationLog } from "./migrations.js";
import type {
  EditorOperationLogAdapter,
  ReadEditorOperationLogOptions,
  SerializedEditorOperation,
  SerializedEditorOperationLog,
} from "./types.js";

export function serializeEditorOperationLog<
  TPayload,
  TFormat extends string,
  TVersion extends number | string,
>(
  operations: readonly SerializedEditorOperation<TPayload>[],
  options: {
    format: TFormat;
    schemaVersion: TVersion;
    exportedAt?: string | Date | false;
    metadata?: Record<string, unknown>;
  },
): SerializedEditorOperationLog<TPayload, TFormat, TVersion> {
  const log: SerializedEditorOperationLog<TPayload, TFormat, TVersion> = {
    format: options.format,
    operations: [...operations],
    schemaVersion: options.schemaVersion,
  };

  if (options.exportedAt !== false) {
    log.exportedAt =
      options.exportedAt instanceof Date
        ? options.exportedAt.toISOString()
        : (options.exportedAt ?? new Date().toISOString());
  }

  if (options.metadata) {
    log.metadata = options.metadata;
  }

  return log;
}

export function readEditorOperationLog<TOperation>(
  input: unknown,
  adapter: EditorOperationLogAdapter<TOperation>,
  options: ReadEditorOperationLogOptions<TOperation> = {},
): readonly TOperation[] {
  const migrated = migrateEditorOperationLog(input, adapter, options.migrations);
  const path = options.path ?? "";

  if (!isEditorRecord(migrated) || !isSerializedOperationLog(migrated, adapter.format)) {
    throw new EditorJsonParseError([{ path, message: "Expected operation log envelope." }]);
  }

  const operations = Array.isArray(migrated.operations) ? migrated.operations : null;
  if (!operations) {
    throw new EditorJsonParseError([
      { path: joinOperationLogPath(path, "operations"), message: "Expected operations array." },
    ]);
  }

  const readOperations: TOperation[] = [];
  const issues: EditorParseIssue[] = [];
  for (const [index, operationInput] of operations.entries()) {
    const operationPath = `${joinOperationLogPath(path, "operations")}.${index}`;
    try {
      const operation = normalizeEditorOperationLogOperation(
        adapter.read(operationInput, operationPath),
        adapter,
      );
      const operationIssues = adapter.validate?.(operation) ?? [];
      if (operationIssues.length > 0) {
        issues.push(...operationIssues);
      }
      readOperations.push(operation);
    } catch (error) {
      if (error instanceof EditorJsonParseError) {
        issues.push(...error.issues);
      } else {
        throw error;
      }
    }
  }

  if (issues.length > 0) {
    throw new EditorJsonParseError(issues);
  }

  return readOperations;
}

function normalizeEditorOperationLogOperation<TOperation>(
  operation: TOperation,
  adapter: EditorOperationLogAdapter<TOperation>,
): TOperation {
  return adapter.normalize ? adapter.normalize(operation) : operation;
}

function joinOperationLogPath(root: string, segment: string): string {
  return root ? `${root}.${segment}` : segment;
}

function isSerializedOperationLog(input: Record<string, unknown>, format: string): boolean {
  return input.format === format && "schemaVersion" in input && "operations" in input;
}
