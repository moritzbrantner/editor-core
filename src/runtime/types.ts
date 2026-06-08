import type {
  EditorAspectDefinition,
  EditorAspectSnapshot,
  EditorChangeOrigin,
} from "../aspects.js";
import type { EditorSnapshotHistory, EditorSnapshotHistoryOptions } from "../history.js";
import type { EditorParseIssue } from "../serialization.js";

export type EditorRuntimeStatus = "clean" | "dirty";

export type EditorRuntimeSelection<TSelection = unknown> = TSelection | null;

export type EditorRuntimeUpdateContext<TDocument, TSelection = unknown> = {
  document: TDocument;
  selection: EditorRuntimeSelection<TSelection>;
  revision: number;
};

export type EditorRuntimeUpdate<TDocument, TSelection = unknown> =
  | TDocument
  | ((context: EditorRuntimeUpdateContext<TDocument, TSelection>) => TDocument);

export type EditorRuntimeValidationIssue = EditorParseIssue;

export type EditorRuntimeValidator<TDocument> = (
  document: TDocument,
) => readonly EditorRuntimeValidationIssue[];

export type EditorRuntimeOptions<TDocument, TSelection = unknown> = {
  initialDocument: TDocument;
  initialSelection?: EditorRuntimeSelection<TSelection>;
  history?: EditorSnapshotHistoryOptions<TDocument>;
  validate?: EditorRuntimeValidator<TDocument>;
  aspects?: readonly EditorAspectDefinition<TDocument, unknown>[];
  origin?: EditorChangeOrigin;
};

export type EditorRuntimeStateOptions<TDocument, TSelection = unknown> = Omit<
  EditorRuntimeOptions<TDocument, TSelection>,
  "initialDocument" | "initialSelection"
>;

export type EditorRuntimeState<TDocument, TSelection = unknown> = {
  document: TDocument;
  selection: EditorRuntimeSelection<TSelection>;
  history: EditorSnapshotHistory<TDocument>;
  revision: number;
  savedRevision: number;
  status: EditorRuntimeStatus;
  canUndo: boolean;
  canRedo: boolean;
  issues: readonly EditorRuntimeValidationIssue[];
  aspectSnapshot: EditorAspectSnapshot<TDocument>;
  origin?: EditorChangeOrigin;
};

export type CommitEditorRuntimeOptions<TSelection = unknown> = {
  selection?: EditorRuntimeSelection<TSelection>;
  origin?: EditorChangeOrigin;
  markSaved?: boolean;
};

export type ResetEditorRuntimeOptions<TSelection = unknown> = {
  selection?: EditorRuntimeSelection<TSelection>;
  origin?: EditorChangeOrigin;
  markSaved?: boolean;
};
