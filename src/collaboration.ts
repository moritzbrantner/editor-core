export type EditorClientId = string;
export type EditorActorId = string;
export type EditorRevisionToken = string | number;

export type EditorPresence<TSelection = unknown> = {
  clientId: EditorClientId;
  actorId?: EditorActorId;
  selection?: TSelection | null;
  cursor?: unknown;
  color?: string;
  label?: string;
  lastSeenAt?: string;
  metadata?: Record<string, unknown>;
};

export type EditorRemoteOperation<TOperation = unknown> = {
  id: string;
  clientId: EditorClientId;
  actorId?: EditorActorId;
  revision?: EditorRevisionToken;
  operation: TOperation;
  receivedAt?: string;
  metadata?: Record<string, unknown>;
};

export type EditorCollaborationState<TSelection = unknown> = {
  clientId: EditorClientId;
  revision: EditorRevisionToken | null;
  seenOperationIds: readonly string[];
  presence: Record<EditorClientId, EditorPresence<TSelection>>;
};

export type CreateEditorCollaborationStateOptions<TSelection = unknown> = {
  clientId: EditorClientId;
  revision?: EditorRevisionToken | null;
  seenOperationIds?: readonly string[];
  presence?: Record<EditorClientId, EditorPresence<TSelection>>;
};

export type PruneEditorPresenceOptions = {
  now: string | Date;
  maxAgeMs: number;
};

export type MarkEditorRemoteOperationSeenOptions = {
  limit?: number;
};

export type DedupeEditorRemoteOperationsOptions = MarkEditorRemoteOperationSeenOptions & {
  includeLocalClient?: boolean;
};

export type DedupeEditorRemoteOperationsResult<TOperation, TSelection = unknown> = {
  state: EditorCollaborationState<TSelection>;
  operations: readonly EditorRemoteOperation<TOperation>[];
};

const defaultEditorSeenOperationLimit = 1000;

export function createEditorCollaborationState<TSelection = unknown>(
  options: CreateEditorCollaborationStateOptions<TSelection>,
): EditorCollaborationState<TSelection> {
  return {
    clientId: options.clientId,
    presence: { ...options.presence },
    revision: options.revision ?? null,
    seenOperationIds: [...(options.seenOperationIds ?? [])],
  };
}

export function updateEditorPresence<TSelection>(
  state: EditorCollaborationState<TSelection>,
  presence: EditorPresence<TSelection>,
): EditorCollaborationState<TSelection> {
  return {
    ...state,
    presence: {
      ...state.presence,
      [presence.clientId]: presence,
    },
  };
}

export function removeEditorPresence<TSelection>(
  state: EditorCollaborationState<TSelection>,
  clientId: EditorClientId,
): EditorCollaborationState<TSelection> {
  if (!Object.hasOwn(state.presence, clientId)) {
    return state;
  }

  const { [clientId]: _removed, ...presence } = state.presence;
  void _removed;
  return {
    ...state,
    presence,
  };
}

export function pruneEditorPresence<TSelection>(
  state: EditorCollaborationState<TSelection>,
  options: PruneEditorPresenceOptions,
): EditorCollaborationState<TSelection> {
  const now = new Date(options.now).getTime();
  const presence = Object.fromEntries(
    Object.entries(state.presence).filter(([, entry]) => {
      if (!entry.lastSeenAt) {
        return true;
      }

      return now - new Date(entry.lastSeenAt).getTime() <= options.maxAgeMs;
    }),
  );

  return {
    ...state,
    presence,
  };
}

export function hasSeenEditorRemoteOperation(
  state: EditorCollaborationState,
  operationId: string,
): boolean {
  return state.seenOperationIds.includes(operationId);
}

export function markEditorRemoteOperationSeen<TSelection>(
  state: EditorCollaborationState<TSelection>,
  operationId: string,
  options: MarkEditorRemoteOperationSeenOptions = {},
): EditorCollaborationState<TSelection> {
  if (hasSeenEditorRemoteOperation(state, operationId)) {
    return state;
  }

  const limit = normalizeSeenOperationLimit(options.limit);
  return {
    ...state,
    seenOperationIds: limit === 0 ? [] : [...state.seenOperationIds, operationId].slice(-limit),
  };
}

export function dedupeEditorRemoteOperations<TOperation, TSelection = unknown>(
  state: EditorCollaborationState<TSelection>,
  operations: readonly EditorRemoteOperation<TOperation>[],
  options: DedupeEditorRemoteOperationsOptions = {},
): DedupeEditorRemoteOperationsResult<TOperation, TSelection> {
  let nextState = state;
  const deduped: EditorRemoteOperation<TOperation>[] = [];

  for (const operation of operations) {
    if (!options.includeLocalClient && operation.clientId === state.clientId) {
      nextState = markEditorRemoteOperationSeen(nextState, operation.id, options);
      continue;
    }

    if (hasSeenEditorRemoteOperation(nextState, operation.id)) {
      continue;
    }

    nextState = markEditorRemoteOperationSeen(nextState, operation.id, options);
    deduped.push(operation);
  }

  return {
    operations: deduped,
    state: nextState,
  };
}

function normalizeSeenOperationLimit(limit: number | undefined): number {
  return Math.max(0, Math.trunc(limit ?? defaultEditorSeenOperationLimit));
}
