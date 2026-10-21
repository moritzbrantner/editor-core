import { EditorSessionError, toEditorSessionError } from "./errors.js";

/** Converts documents to and from the JSON payload an editor session stores. */
export type EditorSessionCodec<TDocument> = {
  /** Converts a document to a JSON-compatible payload. Defaults to the document itself. */
  serialize?: (document: TDocument) => unknown;
  /** Upgrades an older stored payload. Throwing marks the payload unmigratable. */
  migrate?: (payload: unknown) => unknown;
  /** Validates a current payload into a document. Throwing marks the payload invalid. */
  parse: (payload: unknown) => TDocument;
};

export function encodeEditorSessionPayload<TDocument>(
  codec: EditorSessionCodec<TDocument>,
  document: TDocument,
): string {
  try {
    const encoded = JSON.stringify(codec.serialize ? codec.serialize(document) : document);
    if (encoded === undefined) {
      throw new EditorSessionError("serialization", "The document serialized to nothing.");
    }
    return encoded;
  } catch (error) {
    throw toEditorSessionError(error, "serialization");
  }
}

export function decodeEditorSessionPayload<TDocument>(
  codec: EditorSessionCodec<TDocument>,
  value: string,
): TDocument {
  let payload = attempt(() => JSON.parse(value) as unknown, "serialization");
  if (codec.migrate) {
    const migrate = codec.migrate;
    payload = attempt(() => migrate(payload), "migration");
  }
  return attempt(() => codec.parse(payload), "validation");
}

function attempt<TValue>(
  run: () => TValue,
  kind: "serialization" | "migration" | "validation",
): TValue {
  try {
    return run();
  } catch (error) {
    throw toEditorSessionError(error, kind);
  }
}
