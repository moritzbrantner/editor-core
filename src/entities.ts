export type EditorEntityId = string;

export type EditorEntityBase = {
  id: EditorEntityId;
  type: string;
  parentId?: EditorEntityId | null;
  order?: string | number;
  metadata?: Record<string, unknown>;
};

export type EditorEntityDocument<TEntity extends EditorEntityBase = EditorEntityBase> = {
  entities: Record<EditorEntityId, TEntity>;
  rootIds: readonly EditorEntityId[];
};

export type EditorPoint = {
  x: number;
  y: number;
};

export type EditorSize = {
  height: number;
  width: number;
};

export type EditorBounds = EditorPoint & EditorSize;

export type EditorEntityBoundsAdapter<TEntity extends EditorEntityBase = EditorEntityBase> = {
  getBounds: (entity: TEntity) => EditorBounds | null | undefined;
};

export type EditorIdFactory = (prefix?: string) => EditorEntityId;

export type CreateUniqueEditorIdOptions = {
  fallback?: string;
  separator?: string;
  startIndex?: number;
};

export type EditorLayerAdapter<TEntity extends EditorEntityBase = EditorEntityBase> = {
  getBounds?: (entity: TEntity) => EditorBounds | null | undefined;
  getParentId?: (entity: TEntity) => EditorEntityId | null | undefined;
  getOrder?: (entity: TEntity) => string | number | undefined;
  isLocked?: (entity: TEntity) => boolean;
  isVisible?: (entity: TEntity) => boolean;
};

export type EditorGraphPort = {
  id: string;
  label?: string;
  direction?: "input" | "output" | "bidirectional";
};

export type EditorGraphEdge = {
  id: EditorEntityId;
  sourceId: EditorEntityId;
  targetId: EditorEntityId;
  sourcePortId?: string;
  targetPortId?: string;
  type?: string;
};

export type EditorGraphAdapter<
  TDocument = unknown,
  TNode extends EditorEntityBase = EditorEntityBase,
  TEdge extends EditorGraphEdge = EditorGraphEdge,
> = {
  getNodes: (document: TDocument) => readonly TNode[];
  getEdges: (document: TDocument) => readonly TEdge[];
  getPorts?: (node: TNode) => readonly EditorGraphPort[];
  canConnect?: (connection: {
    sourceId: EditorEntityId;
    sourcePortId?: string;
    targetId: EditorEntityId;
    targetPortId?: string;
  }) => boolean;
};

export type EditorWorkflowAdapter<
  TDocument = unknown,
  TNode extends EditorEntityBase = EditorEntityBase,
  TTransition extends EditorGraphEdge = EditorGraphEdge,
> = EditorGraphAdapter<TDocument, TNode, TTransition> & {
  isStartNode?: (node: TNode) => boolean;
  isEndNode?: (node: TNode) => boolean;
};

export type EditorTimelineRange = {
  start: number;
  end: number;
};

export type EditorTimelineTrack<TEntity extends EditorEntityBase = EditorEntityBase> = TEntity;

export type EditorTimelineItem<TEntity extends EditorEntityBase = EditorEntityBase> = TEntity & {
  trackId: EditorEntityId;
  range: EditorTimelineRange;
};

export type EditorTimelineAdapter<
  TDocument = unknown,
  TTrack extends EditorEntityBase = EditorTimelineTrack,
  TItem extends EditorTimelineItem = EditorTimelineItem,
> = {
  getTracks: (document: TDocument) => readonly TTrack[];
  getItems: (document: TDocument) => readonly TItem[];
  getPlayhead?: (document: TDocument) => number;
  snapTime?: (time: number) => number;
};

export function createEditorEntityDocument<TEntity extends EditorEntityBase>(
  entities: readonly TEntity[],
  rootIds: readonly EditorEntityId[] = entities
    .filter((entity) => entity.parentId === undefined || entity.parentId === null)
    .map((entity) => entity.id),
): EditorEntityDocument<TEntity> {
  const seenIds = new Set<EditorEntityId>();
  for (const entity of entities) {
    if (seenIds.has(entity.id)) {
      throw new Error(`Duplicate editor entity id "${entity.id}".`);
    }
    seenIds.add(entity.id);
  }

  return {
    entities: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
    rootIds: [...rootIds],
  };
}

export function getEditorEntity<TEntity extends EditorEntityBase>(
  document: EditorEntityDocument<TEntity>,
  id: EditorEntityId,
): TEntity | null {
  return document.entities[id] ?? null;
}

export function isEditorEntityId(id: unknown): id is EditorEntityId {
  return typeof id === "string" && id.length > 0;
}

export function createUniqueEditorId(
  baseId: string,
  existingIds: ReadonlySet<string> | readonly string[],
  options: CreateUniqueEditorIdOptions = {},
): EditorEntityId {
  const base = baseId.trim() || (options.fallback ?? "item");
  const hasId = (id: string) =>
    Array.isArray(existingIds)
      ? (existingIds as readonly string[]).includes(id)
      : (existingIds as ReadonlySet<string>).has(id);

  if (!hasId(base)) {
    return base;
  }

  const separator = options.separator ?? "-";
  let index = options.startIndex ?? 2;
  while (hasId(`${base}${separator}${index}`)) {
    index += 1;
  }
  return `${base}${separator}${index}`;
}

export function createIncrementingEditorIdFactory(
  options: { prefix?: string } = {},
): EditorIdFactory {
  let nextId = 1;
  return (prefix = options.prefix ?? "entity") => `${prefix}-${nextId++}`;
}
