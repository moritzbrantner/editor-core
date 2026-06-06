import { createStableEditorJsonEquals, stableEditorJsonStringify } from "./json.js";
import {
  readEditorOperationLog,
  type EditorOperationLogAdapter,
  type EditorOperationLogMigrations,
} from "./operations.js";
import {
  EditorJsonParseError,
  EditorMigrationError,
  readEditorDocument,
  serializeEditorDocument,
  type EditorDocumentAdapter,
  type EditorDocumentMigrations,
  type EditorParseIssue,
} from "./serialization.js";

export type EditorAdapterCheckSeverity = "error" | "warning";

export type EditorAdapterCheckIssue = {
  caseId: string;
  path: string;
  message: string;
  severity: EditorAdapterCheckSeverity;
};

export type EditorAdapterCheckResult<TValue> = {
  ok: boolean;
  value?: TValue;
  issues: readonly EditorAdapterCheckIssue[];
};

export type EditorDocumentAdapterCheckCase<TDocument> = {
  id: string;
  input: unknown;
  expected?: TDocument;
  migrations?: EditorDocumentMigrations<TDocument>;
  expectIssues?: readonly EditorParseIssue[];
  roundtrip?: boolean;
};

export type EditorOperationLogAdapterCheckCase<TOperation> = {
  id: string;
  input: unknown;
  expected?: readonly TOperation[];
  migrations?: EditorOperationLogMigrations<TOperation>;
  expectIssues?: readonly EditorParseIssue[];
};

export class EditorAdapterContractError extends Error {
  issues: readonly EditorAdapterCheckIssue[];

  constructor(issues: readonly EditorAdapterCheckIssue[]) {
    super(formatAdapterContractIssues(issues));
    this.name = "EditorAdapterContractError";
    this.issues = issues;
  }
}

export function checkEditorDocumentAdapter<TDocument>(
  adapter: EditorDocumentAdapter<TDocument>,
  testCase: EditorDocumentAdapterCheckCase<TDocument>,
): EditorAdapterCheckResult<TDocument> {
  const issues: EditorAdapterCheckIssue[] = [];

  try {
    const value = readEditorDocument(testCase.input, adapter, {
      migrations: testCase.migrations,
    });

    if (testCase.expectIssues && testCase.expectIssues.length > 0) {
      issues.push(
        createAdapterIssue(
          testCase.id,
          "",
          `Expected ${testCase.expectIssues.length} issue(s), but the adapter accepted the input.`,
        ),
      );
    }

    if (testCase.expected !== undefined && !editorAdapterValuesEqual(value, testCase.expected)) {
      issues.push(
        createAdapterIssue(
          testCase.id,
          "",
          `Expected ${stableEditorJsonStringify(testCase.expected)}, received ${stableEditorJsonStringify(value)}.`,
        ),
      );
    }

    if (testCase.roundtrip) {
      const serialized = serializeEditorDocument(value, adapter, { exportedAt: false });
      const roundtripped = readEditorDocument(serialized, adapter, {
        migrations: testCase.migrations,
      });

      if (!editorAdapterValuesEqual(value, roundtripped)) {
        issues.push(
          createAdapterIssue(
            testCase.id,
            "",
            `Roundtrip changed the document from ${stableEditorJsonStringify(value)} to ${stableEditorJsonStringify(roundtripped)}.`,
          ),
        );
      }
    }

    return { issues, ok: issues.length === 0, value };
  } catch (error) {
    issues.push(...adapterIssuesFromError(testCase.id, error));
    issues.push(...compareExpectedIssues(testCase.id, testCase.expectIssues, issues));
    return { issues, ok: testCaseMatchesExpectedIssues(testCase.expectIssues, issues) };
  }
}

export function assertEditorDocumentAdapter<TDocument>(
  adapter: EditorDocumentAdapter<TDocument>,
  cases: readonly EditorDocumentAdapterCheckCase<TDocument>[],
): void {
  const issues = cases.flatMap((testCase) => {
    const result = checkEditorDocumentAdapter(adapter, testCase);
    return result.ok ? [] : result.issues;
  });

  if (issues.length > 0) {
    throw new EditorAdapterContractError(issues);
  }
}

export function checkEditorOperationLogAdapter<TOperation>(
  adapter: EditorOperationLogAdapter<TOperation>,
  testCase: EditorOperationLogAdapterCheckCase<TOperation>,
): EditorAdapterCheckResult<readonly TOperation[]> {
  const issues: EditorAdapterCheckIssue[] = [];

  try {
    const value = readEditorOperationLog(testCase.input, adapter, {
      migrations: testCase.migrations,
    });

    if (testCase.expectIssues && testCase.expectIssues.length > 0) {
      issues.push(
        createAdapterIssue(
          testCase.id,
          "",
          `Expected ${testCase.expectIssues.length} issue(s), but the adapter accepted the input.`,
        ),
      );
    }

    if (testCase.expected !== undefined && !editorAdapterValuesEqual(value, testCase.expected)) {
      issues.push(
        createAdapterIssue(
          testCase.id,
          "",
          `Expected ${stableEditorJsonStringify(testCase.expected)}, received ${stableEditorJsonStringify(value)}.`,
        ),
      );
    }

    return { issues, ok: issues.length === 0, value };
  } catch (error) {
    issues.push(...adapterIssuesFromError(testCase.id, error));
    issues.push(...compareExpectedIssues(testCase.id, testCase.expectIssues, issues));
    return { issues, ok: testCaseMatchesExpectedIssues(testCase.expectIssues, issues) };
  }
}

export function assertEditorOperationLogAdapter<TOperation>(
  adapter: EditorOperationLogAdapter<TOperation>,
  cases: readonly EditorOperationLogAdapterCheckCase<TOperation>[],
): void {
  const issues = cases.flatMap((testCase) => {
    const result = checkEditorOperationLogAdapter(adapter, testCase);
    return result.ok ? [] : result.issues;
  });

  if (issues.length > 0) {
    throw new EditorAdapterContractError(issues);
  }
}

const editorAdapterValuesEqual = createStableEditorJsonEquals<unknown>();

function adapterIssuesFromError(caseId: string, error: unknown): EditorAdapterCheckIssue[] {
  if (error instanceof EditorJsonParseError) {
    return error.issues.map((issue) => createAdapterIssue(caseId, issue.path, issue.message));
  }

  if (error instanceof EditorMigrationError) {
    return [createAdapterIssue(caseId, "schemaVersion", error.message)];
  }

  return [
    createAdapterIssue(
      caseId,
      "",
      error instanceof Error ? error.message : "Adapter check failed.",
    ),
  ];
}

function compareExpectedIssues(
  caseId: string,
  expected: readonly EditorParseIssue[] | undefined,
  actual: readonly EditorAdapterCheckIssue[],
): EditorAdapterCheckIssue[] {
  if (!expected || expected.length === 0) {
    return [];
  }

  const actualParseIssues = actual.map(({ path, message }) => ({ path, message }));
  if (editorAdapterValuesEqual(actualParseIssues, expected)) {
    return [];
  }

  return [
    createAdapterIssue(
      caseId,
      "",
      `Expected issues ${stableEditorJsonStringify(expected)}, received ${stableEditorJsonStringify(actualParseIssues)}.`,
    ),
  ];
}

function testCaseMatchesExpectedIssues(
  expected: readonly EditorParseIssue[] | undefined,
  actual: readonly EditorAdapterCheckIssue[],
): boolean {
  if (!expected || expected.length === 0) {
    return actual.length === 0;
  }

  const actualParseIssues = actual.map(({ path, message }) => ({ path, message }));
  return editorAdapterValuesEqual(actualParseIssues, expected);
}

function createAdapterIssue(
  caseId: string,
  path: string,
  message: string,
  severity: EditorAdapterCheckSeverity = "error",
): EditorAdapterCheckIssue {
  return {
    caseId,
    message,
    path,
    severity,
  };
}

function formatAdapterContractIssues(issues: readonly EditorAdapterCheckIssue[]): string {
  if (issues.length === 0) {
    return "Editor adapter contract failed.";
  }

  return issues
    .map((issue) => {
      const path = issue.path ? ` ${issue.path}` : "";
      return `${issue.caseId}${path}: ${issue.message}`;
    })
    .join("; ");
}
