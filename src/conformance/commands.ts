import { createEditorCommandRuntime, type EditorCommandRuntimeEvent } from "../commands.js";
import type { EditorCommandDefinition } from "../hotkeys.js";
import { createStableEditorJsonEquals, stableEditorJsonStringify } from "../json.js";

export type EditorReadOnlyCommandConformanceIssue = {
  capability: "command";
  message: string;
  path?: string;
};

export type EditorReadOnlyCommandConformanceResult = {
  ok: boolean;
  issues: readonly EditorReadOnlyCommandConformanceIssue[];
};

export type EditorReadOnlyCommandConformanceSetup<
  TDocument,
  TCommandId extends string,
> = {
  commands: readonly EditorCommandDefinition<TCommandId>[];
  event: EditorCommandRuntimeEvent;
  getDocument: () => TDocument;
};

export type EditorReadOnlyCommandConformanceCase<
  TDocument,
  TCommandId extends string,
> = {
  create: () => EditorReadOnlyCommandConformanceSetup<TDocument, TCommandId>;
  name?: string;
};

export type EditorReadOnlyCommandConformanceAdapter<
  TDocument,
  TCommandId extends string,
> = {
  cases: readonly EditorReadOnlyCommandConformanceCase<TDocument, TCommandId>[];
  equals?: (left: TDocument, right: TDocument) => boolean;
};

export async function checkEditorReadOnlyCommandConformance<
  TDocument,
  TCommandId extends string,
>(
  adapter: EditorReadOnlyCommandConformanceAdapter<TDocument, TCommandId>,
): Promise<EditorReadOnlyCommandConformanceResult> {
  const issues: EditorReadOnlyCommandConformanceIssue[] = [];
  const equals = adapter.equals ?? createStableEditorJsonEquals<TDocument>();

  for (const commandCase of adapter.cases) {
    const path = commandCase.name;
    const writable = commandCase.create();
    const writableInitial = writable.getDocument();
    const writableInitialSnapshot = stableEditorJsonStringify(writableInitial);
    const writableRuntime = createEditorCommandRuntime({ commands: writable.commands });
    const writableResult = await writableRuntime.run(writable.event);
    const writableDocument = writable.getDocument();

    if (writableResult.status !== "ran") {
      issues.push({
        capability: "command",
        message: `Writable command case did not run; received ${writableResult.status === "ignored" ? writableResult.reason : writableResult.status}.`,
        ...(path ? { path } : {}),
      });
      continue;
    }

    if (
      equals(writableInitial, writableDocument) &&
      stableEditorJsonStringify(writableDocument) === writableInitialSnapshot
    ) {
      issues.push({
        capability: "command",
        message: "Writable command case did not mutate the document, so the read-only assertion would be vacuous.",
        ...(path ? { path } : {}),
      });
      continue;
    }

    const readOnly = commandCase.create();
    const readOnlyInitial = readOnly.getDocument();
    const readOnlyInitialSnapshot = stableEditorJsonStringify(readOnlyInitial);
    const readOnlyRuntime = createEditorCommandRuntime({
      commands: readOnly.commands,
      readOnly: true,
    });
    const readOnlyResult = await readOnlyRuntime.run(readOnly.event);
    const readOnlyDocument = readOnly.getDocument();

    if (readOnlyResult.status !== "ignored" || readOnlyResult.reason !== "read-only") {
      issues.push({
        capability: "command",
        message: "Read-only command case was not rejected with the read-only runtime reason.",
        ...(path ? { path } : {}),
      });
    }

    if (
      !equals(readOnlyInitial, readOnlyDocument) ||
      stableEditorJsonStringify(readOnlyInitial) !== readOnlyInitialSnapshot
    ) {
      issues.push({
        capability: "command",
        message: `Read-only command mutated the document from ${readOnlyInitialSnapshot} to ${stableEditorJsonStringify(readOnlyDocument)}.`,
        ...(path ? { path } : {}),
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
