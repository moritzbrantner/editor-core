import type {
  EditorEntityBase,
  EditorEntityDocument,
  EditorEntityId,
  EditorGraphEdge,
  EditorTimelineItem,
} from "./entities.js";
import type { EditorParseIssue } from "./serialization.js";

export type EditorEntityIndexes<TEntity extends EditorEntityBase = EditorEntityBase> = {
  entitiesById: ReadonlyMap<EditorEntityId, TEntity>;
  childrenByParentId: ReadonlyMap<EditorEntityId | null, readonly TEntity[]>;
  parentByChildId: ReadonlyMap<EditorEntityId, EditorEntityId | null>;
  orderedRootIds: readonly EditorEntityId[];
};

export type EditorGraphIndexes<TEdge extends EditorGraphEdge = EditorGraphEdge> = {
  edgesById: ReadonlyMap<EditorEntityId, TEdge>;
  incomingEdgesByNodeId: ReadonlyMap<EditorEntityId, readonly TEdge[]>;
  outgoingEdgesByNodeId: ReadonlyMap<EditorEntityId, readonly TEdge[]>;
};

export type EditorTimelineIndexes<TItem extends EditorTimelineItem = EditorTimelineItem> = {
  trackItemsByTrackId: ReadonlyMap<EditorEntityId, readonly TItem[]>;
};

export function createEditorEntityIndexes<TEntity extends EditorEntityBase>(
  document: EditorEntityDocument<TEntity>,
): EditorEntityIndexes<TEntity> {
  const entitiesById = new Map<EditorEntityId, TEntity>();
  const childrenByParentId = new Map<EditorEntityId | null, TEntity[]>();
  const parentByChildId = new Map<EditorEntityId, EditorEntityId | null>();

  for (const id in document.entities) {
    if (!Object.hasOwn(document.entities, id)) {
      continue;
    }

    const entity = document.entities[id];
    entitiesById.set(entity.id, entity);
    const parentId = entity.parentId ?? null;
    parentByChildId.set(entity.id, parentId);
    pushMapArray(childrenByParentId, parentId, entity);
  }

  for (const children of childrenByParentId.values()) {
    children.sort(compareEditorEntityOrder);
  }

  const orderedRootIds = [...document.rootIds];
  orderedRootIds.sort((leftId, rightId) =>
    compareEditorEntityOrder(document.entities[leftId], document.entities[rightId]),
  );

  return {
    childrenByParentId,
    entitiesById,
    orderedRootIds,
    parentByChildId,
  };
}

export function createEditorGraphIndexes<TEdge extends EditorGraphEdge>(
  edges: readonly TEdge[],
): EditorGraphIndexes<TEdge> {
  const edgesById = new Map<EditorEntityId, TEdge>();
  const incomingEdgesByNodeId = new Map<EditorEntityId, TEdge[]>();
  const outgoingEdgesByNodeId = new Map<EditorEntityId, TEdge[]>();

  for (const edge of edges) {
    edgesById.set(edge.id, edge);
    pushMapArray(incomingEdgesByNodeId, edge.targetId, edge);
    pushMapArray(outgoingEdgesByNodeId, edge.sourceId, edge);
  }

  return {
    edgesById,
    incomingEdgesByNodeId,
    outgoingEdgesByNodeId,
  };
}

export function createEditorTimelineIndexes<TItem extends EditorTimelineItem>(
  items: readonly TItem[],
): EditorTimelineIndexes<TItem> {
  const trackItemsByTrackId = new Map<EditorEntityId, TItem[]>();
  for (const item of items) {
    pushMapArray(trackItemsByTrackId, item.trackId, item);
  }

  for (const trackItems of trackItemsByTrackId.values()) {
    trackItems.sort((left, right) => left.range.start - right.range.start);
  }

  return { trackItemsByTrackId };
}

export function groupEditorValidationIssuesByEntityId(
  issues: readonly EditorParseIssue[],
): ReadonlyMap<EditorEntityId, readonly EditorParseIssue[]> {
  const issuesByEntityId = new Map<EditorEntityId, EditorParseIssue[]>();
  for (const issue of issues) {
    const entityId = parseIssueEntityId(issue.path);
    if (entityId) {
      pushMapArray(issuesByEntityId, entityId, issue);
    }
  }
  return issuesByEntityId;
}

function compareEditorEntityOrder(
  left: EditorEntityBase | undefined,
  right: EditorEntityBase | undefined,
): number {
  if (!left || !right) {
    return left ? -1 : right ? 1 : 0;
  }

  const leftOrder = left.order ?? left.id;
  const rightOrder = right.order ?? right.id;
  return String(leftOrder).localeCompare(String(rightOrder), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function pushMapArray<TKey, TValue>(map: Map<TKey, TValue[]>, key: TKey, value: TValue): void {
  let values = map.get(key);
  if (!values) {
    values = [];
    map.set(key, values);
  }
  values.push(value);
}

function parseIssueEntityId(path: string): EditorEntityId | null {
  const match = /(?:^|\.|\[)entities(?:\.|\[['"]?)([^.'"\]]+)/u.exec(path);
  return match?.[1] ?? null;
}
