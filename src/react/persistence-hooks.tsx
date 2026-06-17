import type { EditorStorageAdapter } from "../browser.js";
import type {
  EditorAutosaveOptions,
  EditorConflictStorageAdapter,
  EditorPersistenceErrorContext,
  EditorPersistenceEventHandler,
  EditorPersistenceState,
} from "../persistence.js";
import type { EditorRuntimeState } from "../runtime.js";
import { usePersistentEditorRuntimeCore } from "./persistence-runtime-core.js";
import type { UseEditorRuntimeOptions, UseEditorRuntimeResult } from "./runtime-hooks.js";

export type UsePersistentEditorRuntimeOptions<
  TDocument,
  TSelection = unknown,
> = UseEditorRuntimeOptions<TDocument, TSelection> & {
  storage: EditorStorageAdapter<TDocument>;
  autosave?: boolean | EditorAutosaveOptions;
  loadOnMount?: boolean;
  canSave?: (runtime: EditorRuntimeState<TDocument, TSelection>) => boolean;
  onPersistenceError?: (error: unknown, context: EditorPersistenceErrorContext) => void;
  onPersistenceEvent?: EditorPersistenceEventHandler;
};

export type UsePersistentEditorRuntimeResult<
  TDocument,
  TSelection = unknown,
> = UseEditorRuntimeResult<TDocument, TSelection> & {
  persistence: EditorPersistenceState;
  load: () => Promise<void>;
  save: (options?: { force?: boolean }) => Promise<boolean>;
};

export type UseConflictAwareEditorRuntimeOptions<TDocument, TSelection = unknown> = Omit<
  UsePersistentEditorRuntimeOptions<TDocument, TSelection>,
  "storage"
> & {
  storage: EditorConflictStorageAdapter<TDocument>;
};

export type UseConflictAwareEditorRuntimeResult<
  TDocument,
  TSelection = unknown,
> = UseEditorRuntimeResult<TDocument, TSelection> & {
  persistence: EditorPersistenceState;
  load: () => Promise<void>;
  save: (options?: { force?: boolean }) => Promise<boolean>;
};

export function usePersistentEditorRuntime<TDocument, TSelection = unknown>(
  options: UsePersistentEditorRuntimeOptions<TDocument, TSelection>,
): UsePersistentEditorRuntimeResult<TDocument, TSelection> {
  return usePersistentEditorRuntimeCore<TDocument, TSelection, EditorStorageAdapter<TDocument>>(
    options,
    "storage",
  );
}

export function useConflictAwareEditorRuntime<TDocument, TSelection = unknown>(
  options: UseConflictAwareEditorRuntimeOptions<TDocument, TSelection>,
): UseConflictAwareEditorRuntimeResult<TDocument, TSelection> {
  return usePersistentEditorRuntimeCore<
    TDocument,
    TSelection,
    EditorConflictStorageAdapter<TDocument>
  >(options, "conflict");
}
