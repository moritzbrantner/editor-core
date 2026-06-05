import { isEditorRecord } from "./json.js";

export type EditorParseIssue = {
  path: string;
  message: string;
};

export class EditorJsonParseError extends Error {
  issues: readonly EditorParseIssue[];

  constructor(issues: readonly EditorParseIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "EditorJsonParseError";
    this.issues = issues;
  }
}

export class EditorMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditorMigrationError";
  }
}

/**
 * Defines how a host editor document is normalized, read from unknown input, validated, and
 * identified inside a serialized envelope.
 *
 * `format` should be globally specific to the document type. `schemaVersion` is compared against
 * incoming envelopes before migrations run.
 */
export type EditorDocumentAdapter<TDocument> = {
  format: string;
  schemaVersion: number | string;
  normalize: (document: TDocument) => TDocument;
  read: (input: unknown, path?: string) => TDocument;
  validate?: (document: TDocument) => readonly EditorParseIssue[];
  unwrapLegacyEnvelope?: (input: Record<string, unknown>) => unknown | undefined;
};

export type SerializedEditorDocument<
  TDocument,
  TFormat extends string = string,
  TVersion extends number | string = number,
> = {
  format: TFormat;
  schemaVersion: TVersion;
  exportedAt?: string;
  metadata?: Record<string, unknown>;
  document: TDocument;
};

export type SerializeEditorDocumentOptions = {
  exportedAt?: string | Date | false;
  metadata?: Record<string, unknown>;
};

export type ReadEditorDocumentOptions<TDocument> = {
  migrations?: EditorDocumentMigrations<TDocument>;
  path?: string;
};

export type EditorDocumentMigration<TDocument> = (
  input: SerializedEditorDocument<unknown>,
  adapter: EditorDocumentAdapter<TDocument>,
) => SerializedEditorDocument<unknown> | unknown;

export type EditorDocumentMigrations<TDocument> = Record<
  string | number,
  EditorDocumentMigration<TDocument>
>;

export function serializeEditorDocument<
  TDocument,
  TFormat extends string = string,
  TVersion extends number | string = number,
>(
  document: TDocument,
  adapter: EditorDocumentAdapter<TDocument> & { format: TFormat; schemaVersion: TVersion },
  options: SerializeEditorDocumentOptions = {},
): SerializedEditorDocument<TDocument, TFormat, TVersion> {
  const serialized: SerializedEditorDocument<TDocument, TFormat, TVersion> = {
    format: adapter.format,
    schemaVersion: adapter.schemaVersion,
    document: adapter.normalize(document),
  };

  if (options.exportedAt !== false) {
    serialized.exportedAt =
      options.exportedAt instanceof Date
        ? options.exportedAt.toISOString()
        : (options.exportedAt ?? new Date().toISOString());
  }

  if (options.metadata) {
    serialized.metadata = options.metadata;
  }

  return serialized;
}

export function parseEditorDocumentJson<TDocument>(
  text: string,
  adapter: EditorDocumentAdapter<TDocument>,
  options: ReadEditorDocumentOptions<TDocument> = {},
): TDocument {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new EditorJsonParseError([{ path: options.path ?? "", message: "Invalid JSON." }]);
  }

  return readEditorDocument(input, adapter, options);
}

export function readEditorDocument<TDocument>(
  input: unknown,
  adapter: EditorDocumentAdapter<TDocument>,
  options: ReadEditorDocumentOptions<TDocument> = {},
): TDocument {
  const migrated = migrateEditorDocument(input, adapter, options.migrations);
  const documentInput = unwrapDocumentInput(migrated, adapter);
  const document = adapter.normalize(adapter.read(documentInput, options.path ?? ""));
  const issues = adapter.validate?.(document) ?? [];

  if (issues.length > 0) {
    throw new EditorJsonParseError(issues);
  }

  return document;
}

export function migrateEditorDocument<TDocument>(
  input: unknown,
  adapter: EditorDocumentAdapter<TDocument>,
  migrations: EditorDocumentMigrations<TDocument> = {},
  seenVersions: ReadonlySet<string> = new Set(),
): unknown {
  if (!isEditorRecord(input)) {
    return input;
  }

  const legacyDocument = adapter.unwrapLegacyEnvelope?.(input);
  if (legacyDocument !== undefined) {
    return legacyDocument;
  }

  if (!isSerializedEnvelope(input, adapter.format)) {
    return input;
  }

  if (input.schemaVersion === adapter.schemaVersion) {
    return input;
  }

  const versionKey = String(input.schemaVersion);
  if (seenVersions.has(versionKey)) {
    throw new EditorMigrationError(
      `Migration cycle detected for ${adapter.format} schema version ${versionKey}.`,
    );
  }

  const migration = migrations[versionKey];
  if (!migration) {
    throw new EditorMigrationError(
      `Unsupported ${adapter.format} schema version ${String(input.schemaVersion)}.`,
    );
  }

  const migrated = migration(input as SerializedEditorDocument<unknown>, adapter);
  return migrateEditorDocument(
    migrated,
    adapter,
    migrations,
    new Set([...seenVersions, versionKey]),
  );
}

function unwrapDocumentInput<TDocument>(
  input: unknown,
  adapter: EditorDocumentAdapter<TDocument>,
): unknown {
  if (!isEditorRecord(input)) {
    return input;
  }

  const legacyDocument = adapter.unwrapLegacyEnvelope?.(input);
  if (legacyDocument !== undefined) {
    return legacyDocument;
  }

  if (isSerializedEnvelope(input, adapter.format)) {
    return input.document;
  }

  return input;
}

function isSerializedEnvelope(input: Record<string, unknown>, format: string) {
  return input.format === format && "schemaVersion" in input && "document" in input;
}
