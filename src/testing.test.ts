import { describe, expect, test } from "vitest";
import type { EditorDocumentAdapter, EditorDocumentMigrations } from "./serialization.js";
import type { EditorOperationLogAdapter, EditorOperationLogMigrations } from "./operations.js";
import {
  assertEditorDocumentAdapter,
  assertEditorOperationLogAdapter,
  checkEditorDocumentAdapter,
  checkEditorOperationLogAdapter,
  EditorAdapterContractError,
} from "./testing.js";

type Document = {
  title: string;
  updatedAt?: string;
};

type Operation = {
  id: string;
  type: string;
  title?: string;
};

const documentAdapter: EditorDocumentAdapter<Document> = {
  format: "@example/document",
  schemaVersion: 2,
  normalize(document) {
    return {
      title: document.title.trim(),
      updatedAt: document.updatedAt,
    };
  },
  read(input) {
    const value = input as Partial<Document>;
    return {
      title: typeof value.title === "string" ? value.title : "",
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
    };
  },
  unwrapLegacyEnvelope(input) {
    return "legacy" in input ? input.legacy : undefined;
  },
  validate(document) {
    return document.title ? [] : [{ path: "title", message: "Title is required." }];
  },
};

const operationAdapter: EditorOperationLogAdapter<Operation> = {
  format: "@example/operations",
  schemaVersion: 2,
  normalize(operation) {
    return {
      ...operation,
      title: operation.title?.trim(),
    };
  },
  read(input) {
    const value = input as Partial<Operation>;
    return {
      id: typeof value.id === "string" ? value.id : "",
      title: typeof value.title === "string" ? value.title : undefined,
      type: typeof value.type === "string" ? value.type : "",
    };
  },
  validate(operation) {
    return operation.id ? [] : [{ path: "operations.id", message: "Operation id is required." }];
  },
};

describe("editor adapter contract helpers", () => {
  test("checks valid documents, normalizes, and roundtrips", () => {
    const result = checkEditorDocumentAdapter(documentAdapter, {
      expected: { title: "Draft", updatedAt: undefined },
      id: "current-document",
      input: {
        document: { title: " Draft " },
        format: documentAdapter.format,
        schemaVersion: documentAdapter.schemaVersion,
      },
      roundtrip: true,
    });

    expect(result).toMatchObject({
      issues: [],
      ok: true,
      value: { title: "Draft" },
    });
  });

  test("accepts legacy envelopes and migrated documents", () => {
    const migrations: EditorDocumentMigrations<Document> = {
      1: (input) => ({
        ...input,
        document: {
          ...(input.document as Record<string, unknown>),
          updatedAt: "2026-06-06T12:00:00.000Z",
        },
        schemaVersion: 2,
      }),
    };

    assertEditorDocumentAdapter(documentAdapter, [
      {
        expected: { title: "Legacy", updatedAt: undefined },
        id: "legacy",
        input: { legacy: { title: " Legacy " } },
      },
      {
        expected: { title: "Migrated", updatedAt: "2026-06-06T12:00:00.000Z" },
        id: "migrated",
        input: {
          document: { title: " Migrated " },
          format: documentAdapter.format,
          schemaVersion: 1,
        },
        migrations,
      },
    ]);
  });

  test("reports unsupported versions, migration cycles, and validation issues", () => {
    const unsupported = checkEditorDocumentAdapter(documentAdapter, {
      id: "unsupported",
      input: {
        document: { title: "Draft" },
        format: documentAdapter.format,
        schemaVersion: 0,
      },
    });
    expect(unsupported.ok).toBe(false);
    expect(unsupported.issues[0]?.message).toContain("Unsupported");

    const cycleMigrations: EditorDocumentMigrations<Document> = {
      1: (input) => input,
    };
    const cycle = checkEditorDocumentAdapter(documentAdapter, {
      id: "cycle",
      input: {
        document: { title: "Draft" },
        format: documentAdapter.format,
        schemaVersion: 1,
      },
      migrations: cycleMigrations,
    });
    expect(cycle.ok).toBe(false);
    expect(cycle.issues[0]?.message).toContain("Migration cycle");

    const validation = checkEditorDocumentAdapter(documentAdapter, {
      expectIssues: [{ path: "title", message: "Title is required." }],
      id: "validation",
      input: {
        document: { title: "" },
        format: documentAdapter.format,
        schemaVersion: 2,
      },
    });
    expect(validation.ok).toBe(true);
    expect(validation.issues).toEqual([
      {
        caseId: "validation",
        message: "Title is required.",
        path: "title",
        severity: "error",
      },
    ]);
  });

  test("assertion helpers throw package-owned contract errors", () => {
    expect(() =>
      assertEditorDocumentAdapter(documentAdapter, [
        {
          expected: { title: "Expected" },
          id: "mismatch",
          input: { title: "Actual" },
        },
      ]),
    ).toThrow(EditorAdapterContractError);
  });

  test("checks operation logs and migrations", () => {
    const migrations: EditorOperationLogMigrations<Operation> = {
      1: (input) => ({
        ...input,
        operations: input.operations.map((operation) => ({
          ...(operation as Record<string, unknown>),
          type: "rename",
        })),
        schemaVersion: 2,
      }),
    };

    const input = {
      format: operationAdapter.format,
      operations: [{ id: "op", payload: {}, schemaVersion: 1, title: " Draft ", type: "legacy" }],
      schemaVersion: 1,
    } as unknown;

    const result = checkEditorOperationLogAdapter(operationAdapter, {
      expected: [{ id: "op", title: "Draft", type: "rename" }],
      id: "operation-log",
      input,
      migrations,
    });

    expect(result).toMatchObject({
      issues: [],
      ok: true,
      value: [{ id: "op", title: "Draft", type: "rename" }],
    });
  });

  test("reports operation-log validation issues and expected failures", () => {
    const input = {
      format: operationAdapter.format,
      operations: [{ id: "", payload: {}, schemaVersion: 1, type: "rename" }],
      schemaVersion: 2,
    } as unknown;

    const result = checkEditorOperationLogAdapter(operationAdapter, {
      expectIssues: [{ path: "operations.id", message: "Operation id is required." }],
      id: "operation-validation",
      input,
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([
      {
        caseId: "operation-validation",
        message: "Operation id is required.",
        path: "operations.id",
        severity: "error",
      },
    ]);

    expect(() =>
      assertEditorOperationLogAdapter(operationAdapter, [
        {
          expected: [{ id: "expected", type: "rename" }],
          id: "operation-mismatch",
          input: {
            format: operationAdapter.format,
            operations: [{ id: "actual", payload: {}, schemaVersion: 1, type: "rename" }],
            schemaVersion: 2,
          },
        },
      ]),
    ).toThrow(EditorAdapterContractError);
  });
});
