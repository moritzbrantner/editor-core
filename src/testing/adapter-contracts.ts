import { createStableEditorJsonEquals, stableEditorJsonStringify } from "../json.js";
import {
  readEditorOperationLog,
  type EditorOperationLogAdapter,
  type EditorOperationLogMigrations,
} from "../operations.js";
import {
  EditorJsonParseError,
  EditorMigrationError,
  readEditorDocument,
  serializeEditorDocument,
  type EditorDocumentAdapter,
  type EditorDocumentMigrations,
  type EditorParseIssue,
} from "../serialization.js";

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
  readonly issues: readonly EditorAdapterCheckIssue[];

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
    addUnexpectedAcceptanceIssue(issues, testCase);
    addValueMismatchIssue(issues, testCase.id, testCase.expected, value);

    if (testCase.roundtrip) {
      const roundtripped = readEditorDocument(
        serializeEditorDocument(value, adapter, { exportedAt: false }),
        adapter,
        { migrations: testCase.migrations },
      );
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
    return resultFromAdapterError(testCase.id, testCase.expectIssues, error);
  }
}

export function assertEditorDocumentAdapter<TDocument>(
  adapter: EditorDocumentAdapter<TDocument>,
  cases: readonly EditorDocumentAdapterCheckCase<TDocument>[],
): void {
  assertAdapterResults(cases.map((testCase) => checkEditorDocumentAdapter(adapter, testCase)));
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
    addUnexpectedAcceptanceIssue(issues, testCase);
    addValueMismatchIssue(issues, testCase.id, testCase.expected, value);
    return { issues, ok: issues.length === 0, value };
  } catch (error) {
    return resultFromAdapterError(testCase.id, testCase.expectIssues, error);
  }
}

export function assertEditorOperationLogAdapter<TOperation>(
  adapter: EditorOperationLogAdapter<TOperation>,
  cases: readonly EditorOperationLogAdapterCheckCase<TOperation>[],
): void {
  assertAdapterResults(cases.map((testCase) => checkEditorOperationLogAdapter(adapter, testCase)));
}

const editorAdapterValuesEqual = createStableEditorJsonEquals<unknown>();

function addUnexpectedAcceptanceIssue(
  issues: EditorAdapterCheckIssue[],
  testCase: { id: string; expectIssues?: readonly EditorParseIssue[] },
): void {
  if (testCase.expectIssues && testCase.expectIssues.length > 0) {
    issues.push(
      createAdapterIssue(
        testCase.id,
        "",
        `Expected ${testCase.expectIssues.length} issue(s), but the adapter accepted the input.`,
      ),
    );
  }
}

function addValueMismatchIssue<TValue>(
  issues: EditorAdapterCheckIssue[],
  caseId: string,
  expected: TValue | undefined,
  value: TValue,
): void {
  if (expected !== undefined && !editorAdapterValuesEqual(value, expected)) {
    issues.push(
      createAdapterIssue(
        caseId,
        "",
        `Expected ${stableEditorJsonStringify(expected)}, received ${stableEditorJsonStringify(value)}.`,
      ),
    );
  }
}

function resultFromAdapterError<TValue>(
  caseId: string,
  expected: readonly EditorParseIssue[] | undefined,
  error: unknown,
): EditorAdapterCheckResult<TValue> {
  const issues = adapterIssuesFromError(caseId, error);
  issues.push(...compareExpectedIssues(caseId, expected, issues));
  return { issues, ok: testCaseMatchesExpectedIssues(expected, issues) };
}

function assertAdapterResults(results: readonly EditorAdapterCheckResult<unknown>[]): void {
  const issues = results.flatMap((result) => (result.ok ? [] : result.issues));
  if (issues.length > 0) {
    throw new EditorAdapterContractError(issues);
  }
}

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
  return editorAdapterValuesEqual(actualParseIssues, expected)
    ? []
    : [
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
  return editorAdapterValuesEqual(
    actual.map(({ path, message }) => ({ path, message })),
    expected,
  );
}

function createAdapterIssue(
  caseId: string,
  path: string,
  message: string,
  severity: EditorAdapterCheckSeverity = "error",
): EditorAdapterCheckIssue {
  return { caseId, message, path, severity };
}

function formatAdapterContractIssues(issues: readonly EditorAdapterCheckIssue[]): string {
  return issues.length === 0
    ? "Editor adapter contract failed."
    : issues
        .map((issue) => `${issue.caseId}${issue.path ? ` ${issue.path}` : ""}: ${issue.message}`)
        .join("; ");
}
