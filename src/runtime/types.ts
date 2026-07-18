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
  readonly document: TDocument;
  readonly selection: EditorRuntimeSelection<TSelection>;
  readonly revision: number;
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

declare class EditorRuntimeStateIdentity {
  private readonly __editorRuntimeStateIdentity: void;
}

/**
 * Opaque Runtime state created and changed through the Runtime factory and transitions.
 *
 * Do not construct, copy with object spread, or deserialize Runtime state. Persistence restores
 * documents through Runtime transitions instead of restoring this state value.
 */
export type EditorRuntimeState<TDocument, TSelection = unknown> = EditorRuntimeStateIdentity & {
  readonly document: TDocument;
  readonly selection: EditorRuntimeSelection<TSelection>;
  readonly history: EditorSnapshotHistory<TDocument>;
  readonly revision: number;
  readonly savedRevision: number;
  readonly status: EditorRuntimeStatus;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly issues: readonly EditorRuntimeValidationIssue[];
  readonly aspectSnapshot: EditorAspectSnapshot<TDocument>;
  readonly origin?: EditorChangeOrigin;
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
