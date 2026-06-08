import type { EditorRevisionToken } from "../collaboration.js";
import {
  EditorPersistenceConflictError,
  type EditorPersistedDocument,
  type LoadEditorRuntimePersistenceOptions,
  type LoadEditorRuntimePersistenceResult,
  type SaveEditorRuntimePersistenceOptions,
  type SaveEditorRuntimePersistenceResult,
} from "./types.js";

export { EditorPersistenceConflictError, type EditorPersistedDocument };

export type EditorConflictStorageAdapter<TDocument> = {
  load: () =>
    | EditorPersistedDocument<TDocument>
    | null
    | Promise<EditorPersistedDocument<TDocument> | null>;
  save: (
    value: EditorPersistedDocument<TDocument>,
  ) => EditorPersistedDocument<TDocument> | Promise<EditorPersistedDocument<TDocument>>;
};

export type LoadEditorRuntimeConflictPersistenceOptions<
  TDocument,
  TSelection = unknown,
> = LoadEditorRuntimePersistenceOptions<TDocument, TSelection>;

export type LoadEditorRuntimeConflictPersistenceResult<
  TDocument,
  TSelection = unknown,
> = LoadEditorRuntimePersistenceResult<TDocument, TSelection>;

export type SaveEditorRuntimeConflictPersistenceOptions = SaveEditorRuntimePersistenceOptions & {
  revisionToken?: EditorRevisionToken | null;
};

export type SaveEditorRuntimeConflictPersistenceResult<
  TDocument,
  TSelection = unknown,
> = SaveEditorRuntimePersistenceResult<TDocument, TSelection>;
