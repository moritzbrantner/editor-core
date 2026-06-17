import { describe, expect, test } from "vitest";
import {
  EditorJsonParseError,
  EditorMigrationError,
  migrateEditorDocument,
  parseEditorDocumentJson,
  readEditorDocument,
  serializeEditorDocument,
  type EditorDocumentAdapter,
} from "./serialization.js";

type Document = { nodes: string[] };

const adapter: EditorDocumentAdapter<Document> = {
  format: "@example/editor/document",
  schemaVersion: 2,
  normalize: (document) => ({ nodes: [...document.nodes].sort() }),
  read(input, path = "") {
    if (!input || typeof input !== "object" || !Array.isArray((input as Document).nodes)) {
      throw new EditorJsonParseError([{ path: `${path}.nodes`, message: "Expected nodes array." }]);
    }
    return { nodes: (input as Document).nodes.map(String) };
  },
  validate(document) {
    return document.nodes.includes("invalid") ? [{ path: "nodes", message: "Invalid node." }] : [];
  },
  unwrapLegacyEnvelope(input) {
    return input.legacy === true ? input.document : undefined;
  },
};

describe("serialization", () => {
  test("serializes new envelopes and reads raw legacy documents", () => {
    const serialized = serializeEditorDocument({ nodes: ["b", "a"] }, adapter, {
      exportedAt: false,
      metadata: { source: "test" },
    });

    expect(serialized).toEqual({
      document: { nodes: ["a", "b"] },
      format: "@example/editor/document",
      metadata: { source: "test" },
      schemaVersion: 2,
    });
    expect(readEditorDocument({ nodes: ["b", "a"] }, adapter)).toEqual({ nodes: ["a", "b"] });
  });

  test("reads current and legacy envelopes", () => {
    expect(
      readEditorDocument(
        { format: adapter.format, schemaVersion: 2, document: { nodes: ["node"] } },
        adapter,
      ),
    ).toEqual({ nodes: ["node"] });
    expect(readEditorDocument({ legacy: true, document: { nodes: ["legacy"] } }, adapter)).toEqual({
      nodes: ["legacy"],
    });
  });

  test("parses JSON, reports validation issues, and rejects unsupported migrations", () => {
    expect(parseEditorDocumentJson('{"nodes":["node"]}', adapter)).toEqual({ nodes: ["node"] });
    expect(() => readEditorDocument({ nodes: ["invalid"] }, adapter)).toThrow(EditorJsonParseError);
    expect(() =>
      readEditorDocument(
        { format: adapter.format, schemaVersion: 3, document: { nodes: [] } },
        adapter,
      ),
    ).toThrow(EditorMigrationError);
  });

  test("applies explicit migrations by schema version", () => {
    expect(
      readEditorDocument(
        { format: adapter.format, schemaVersion: 1, document: { values: ["migrated"] } },
        adapter,
        {
          migrations: {
            1: (input) => ({
              ...input,
              schemaVersion: 2,
              document: { nodes: (input.document as { values: string[] }).values },
            }),
          },
        },
      ),
    ).toEqual({ nodes: ["migrated"] });
  });

  test("migrates serialized envelopes directly", () => {
    const migrated = migrateEditorDocument(
      { format: adapter.format, schemaVersion: 1, document: { values: ["direct"] } },
      adapter,
      {
        1: (input) => ({
          ...input,
          schemaVersion: 2,
          document: { nodes: (input.document as { values: string[] }).values },
        }),
      },
    );

    expect(migrated).toEqual({
      document: { nodes: ["direct"] },
      format: adapter.format,
      schemaVersion: 2,
    });
    expect(migrateEditorDocument({ nodes: ["raw"] }, adapter)).toEqual({ nodes: ["raw"] });
    expect(migrateEditorDocument(null, adapter)).toBeNull();
  });

  test("applies migration chains", () => {
    expect(
      readEditorDocument(
        { format: adapter.format, schemaVersion: 0, document: { items: ["chain"] } },
        adapter,
        {
          migrations: {
            0: (input) => ({
              ...input,
              schemaVersion: 1,
              document: { values: (input.document as { items: string[] }).items },
            }),
            1: (input) => ({
              ...input,
              schemaVersion: 2,
              document: { nodes: (input.document as { values: string[] }).values },
            }),
          },
        },
      ),
    ).toEqual({ nodes: ["chain"] });
  });

  test("rejects migration cycles", () => {
    expect(() =>
      readEditorDocument(
        { format: adapter.format, schemaVersion: 1, document: { values: ["loop"] } },
        adapter,
        {
          migrations: {
            1: (input) => input,
          },
        },
      ),
    ).toThrow("Migration cycle detected");
  });

  test("does not mutate provided migration cycle tracking set", () => {
    const seenVersions = new Set(["prefilled"]);

    expect(
      migrateEditorDocument(
        { format: adapter.format, schemaVersion: 1, document: { values: ["direct"] } },
        adapter,
        {
          1: (input) => ({
            ...input,
            schemaVersion: 2,
            document: { nodes: (input.document as { values: string[] }).values },
          }),
        },
        seenVersions,
      ),
    ).toEqual({
      document: { nodes: ["direct"] },
      format: adapter.format,
      schemaVersion: 2,
    });
    expect([...seenVersions]).toEqual(["prefilled"]);
  });

  test("supports migrations that return raw documents", () => {
    expect(
      readEditorDocument(
        { format: adapter.format, schemaVersion: 1, document: { values: ["raw"] } },
        adapter,
        {
          migrations: {
            1: () => ({ nodes: ["raw"] }),
          },
        },
      ),
    ).toEqual({ nodes: ["raw"] });
  });

  test("unwraps legacy envelopes before serialized migration handling", () => {
    expect(
      readEditorDocument(
        {
          document: { nodes: ["legacy-first"] },
          format: adapter.format,
          legacy: true,
          schemaVersion: 1,
        },
        adapter,
        {
          migrations: {
            1: () => {
              throw new Error("Migration should not run for legacy envelopes");
            },
          },
        },
      ),
    ).toEqual({ nodes: ["legacy-first"] });
  });

  test("runs legacy unwrap before migration handling at every migration step", () => {
    const laterMigration = () => {
      throw new Error("Later migration should not run for legacy envelopes");
    };

    expect(
      readEditorDocument(
        { format: adapter.format, schemaVersion: 0, document: { values: ["legacy-step"] } },
        adapter,
        {
          migrations: {
            0: (input) => ({
              ...input,
              document: { nodes: ["legacy-step"] },
              legacy: true,
              schemaVersion: 1,
            }),
            1: laterMigration,
          },
        },
      ),
    ).toEqual({ nodes: ["legacy-step"] });
  });

  test("reads documents without validator without creating issues", () => {
    const adapterWithoutValidator: EditorDocumentAdapter<Document> = {
      format: adapter.format,
      normalize: adapter.normalize,
      read: adapter.read,
      schemaVersion: adapter.schemaVersion,
    };

    expect(
      readEditorDocument(
        { format: adapter.format, schemaVersion: 2, document: { nodes: ["node"] } },
        adapterWithoutValidator,
      ),
    ).toEqual({ nodes: ["node"] });
  });
});
