import { isEditorRecord } from "../json.js";
import { EditorMigrationError } from "../serialization.js";
import type {
  EditorOperationLogAdapter,
  EditorOperationLogMigrations,
  SerializedEditorOperationLog,
} from "./types.js";

export function migrateEditorOperationLog<TOperation>(
  input: unknown,
  adapter: EditorOperationLogAdapter<TOperation>,
  migrations: EditorOperationLogMigrations<TOperation> = {},
  seenVersions: ReadonlySet<string> = new Set(),
): unknown {
  if (!isEditorRecord(input) || !isSerializedOperationLog(input, adapter.format)) {
    return input;
  }

  if (input.schemaVersion === adapter.schemaVersion) {
    return input;
  }

  const versionKey = String(input.schemaVersion);
  if (seenVersions.has(versionKey)) {
    throw new EditorMigrationError(
      `Migration cycle detected for ${adapter.format} operation log schema version ${versionKey}.`,
    );
  }

  const migration = migrations[versionKey];
  if (!migration) {
    throw new EditorMigrationError(
      `Unsupported ${adapter.format} operation log schema version ${String(input.schemaVersion)}.`,
    );
  }

  const migrated = migration(input as SerializedEditorOperationLog<unknown>, adapter);
  return migrateEditorOperationLog(
    migrated,
    adapter,
    migrations,
    new Set([...seenVersions, versionKey]),
  );
}

function isSerializedOperationLog(input: Record<string, unknown>, format: string): boolean {
  return input.format === format && "schemaVersion" in input && "operations" in input;
}
