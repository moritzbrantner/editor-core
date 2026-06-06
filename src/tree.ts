export type EditorTreeNodeId = string;
export type EditorTreePathSegment = string | number;
export type EditorTreePath = readonly EditorTreePathSegment[];

export type EditorTreeNode<TMetadata = unknown> = {
  id: EditorTreeNodeId;
  label: string;
  children?: readonly EditorTreeNode<TMetadata>[];
  expandedByDefault?: boolean;
  kind?: string;
  metadata?: TMetadata;
  path?: EditorTreePath;
  selectable?: boolean;
};

/**
 * Projects an editor-owned document model into a stable tree model for navigation UIs.
 *
 * Adapters should return stable node ids so selection and expansion state can survive document
 * edits, reordering, and collaboration sync.
 */
export type EditorTreeAdapter<TDocument, TMetadata = unknown> = {
  getRoot: (document: TDocument) => EditorTreeNode<TMetadata>;
};

export type EditorTreeState = {
  expandedIds: readonly EditorTreeNodeId[];
  selectedId: EditorTreeNodeId | null;
};

export type EditorTreeItem<TMetadata = unknown> = {
  node: EditorTreeNode<TMetadata>;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  parentId: EditorTreeNodeId | null;
  selected: boolean;
};

export type EditorTreeProjection<TMetadata = unknown> = {
  root: EditorTreeNode<TMetadata>;
  items: readonly EditorTreeItem<TMetadata>[];
  nodesById: ReadonlyMap<EditorTreeNodeId, EditorTreeNode<TMetadata>>;
  parentIdsById: ReadonlyMap<EditorTreeNodeId, EditorTreeNodeId | null>;
  state: EditorTreeState;
};

export type EditorTreeItemWindow<TMetadata = unknown> = {
  items: readonly EditorTreeItem<TMetadata>[];
  start: number;
  end: number;
  total: number;
};

export type EditorTreeNodePath = readonly EditorTreeNodeId[];

export type ProjectEditorTreeOptions = {
  state?: EditorTreeState;
};

export function createEditorTreeState(options: Partial<EditorTreeState> = {}): EditorTreeState {
  return {
    expandedIds: normalizeExpandedIds(options.expandedIds),
    selectedId: options.selectedId ?? null,
  };
}

export function projectEditorTree<TDocument, TMetadata = unknown>(
  document: TDocument,
  adapter: EditorTreeAdapter<TDocument, TMetadata>,
  options: ProjectEditorTreeOptions = {},
): EditorTreeProjection<TMetadata> {
  const root = adapter.getRoot(document);
  const state = createEditorTreeState(options.state);
  const nodesById = new Map<EditorTreeNodeId, EditorTreeNode<TMetadata>>();
  const parentIdsById = new Map<EditorTreeNodeId, EditorTreeNodeId | null>();
  const items: Array<EditorTreeItem<TMetadata>> = [];

  collectEditorTreeNodes(root, null, nodesById, parentIdsById);
  collectVisibleEditorTreeItems(root, null, 0, state, options.state === undefined, items);

  return {
    root,
    items,
    nodesById,
    parentIdsById,
    state,
  };
}

export function selectEditorTreeNode(
  state: EditorTreeState,
  id: EditorTreeNodeId | null,
): EditorTreeState {
  return {
    ...state,
    expandedIds: normalizeExpandedIds(state.expandedIds),
    selectedId: id,
  };
}

export function expandEditorTreeNode(
  state: EditorTreeState,
  id: EditorTreeNodeId,
): EditorTreeState {
  return {
    ...state,
    expandedIds: normalizeExpandedIds([...state.expandedIds, id]),
  };
}

export function collapseEditorTreeNode(
  state: EditorTreeState,
  id: EditorTreeNodeId,
): EditorTreeState {
  return {
    ...state,
    expandedIds: normalizeExpandedIds(state.expandedIds.filter((expandedId) => expandedId !== id)),
  };
}

export function toggleEditorTreeNode(
  state: EditorTreeState,
  id: EditorTreeNodeId,
): EditorTreeState {
  return state.expandedIds.includes(id)
    ? collapseEditorTreeNode(state, id)
    : expandEditorTreeNode(state, id);
}

export function getEditorTreeNodePath(
  projection: Pick<EditorTreeProjection, "parentIdsById">,
  id: EditorTreeNodeId,
): EditorTreeNodePath {
  if (!projection.parentIdsById.has(id)) {
    return [];
  }

  const path: EditorTreeNodeId[] = [id];
  let parentId = projection.parentIdsById.get(id) ?? null;
  while (parentId) {
    path.unshift(parentId);
    parentId = projection.parentIdsById.get(parentId) ?? null;
  }
  return path;
}

export function expandEditorTreeAncestors(
  state: EditorTreeState,
  projection: Pick<EditorTreeProjection, "parentIdsById">,
  id: EditorTreeNodeId,
): EditorTreeState {
  const path = getEditorTreeNodePath(projection, id);
  return {
    ...state,
    expandedIds: normalizeExpandedIds([...state.expandedIds, ...path.slice(0, -1)]),
  };
}

export function selectAndRevealEditorTreeNode(
  state: EditorTreeState,
  projection: Pick<EditorTreeProjection, "parentIdsById">,
  id: EditorTreeNodeId,
): EditorTreeState {
  return {
    ...expandEditorTreeAncestors(state, projection, id),
    selectedId: id,
  };
}

export function windowEditorTreeItems<TMetadata>(
  items: readonly EditorTreeItem<TMetadata>[],
  options: { start?: number; count: number },
): EditorTreeItemWindow<TMetadata> {
  const start = Math.max(0, Math.trunc(options.start ?? 0));
  const end = Math.min(items.length, start + Math.max(0, Math.trunc(options.count)));
  return {
    end,
    items: items.slice(start, end),
    start,
    total: items.length,
  };
}

function collectEditorTreeNodes<TMetadata>(
  node: EditorTreeNode<TMetadata>,
  parentId: EditorTreeNodeId | null,
  nodesById: Map<EditorTreeNodeId, EditorTreeNode<TMetadata>>,
  parentIdsById: Map<EditorTreeNodeId, EditorTreeNodeId | null>,
): void {
  validateEditorTreeNodeId(node.id);
  if (nodesById.has(node.id)) {
    throw new Error(`Duplicate editor tree node id "${node.id}".`);
  }

  nodesById.set(node.id, node);
  parentIdsById.set(node.id, parentId);

  for (const child of node.children ?? []) {
    collectEditorTreeNodes(child, node.id, nodesById, parentIdsById);
  }
}

function collectVisibleEditorTreeItems<TMetadata>(
  node: EditorTreeNode<TMetadata>,
  parentId: EditorTreeNodeId | null,
  depth: number,
  state: EditorTreeState,
  useDefaultExpansion: boolean,
  items: Array<EditorTreeItem<TMetadata>>,
): void {
  const hasChildren = (node.children?.length ?? 0) > 0;
  const expanded = isEditorTreeNodeExpanded(node, state, useDefaultExpansion);

  items.push({
    node,
    depth,
    expanded,
    hasChildren,
    parentId,
    selected: node.selectable !== false && state.selectedId === node.id,
  });

  if (!hasChildren || !expanded) {
    return;
  }

  for (const child of node.children ?? []) {
    collectVisibleEditorTreeItems(child, node.id, depth + 1, state, useDefaultExpansion, items);
  }
}

function isEditorTreeNodeExpanded<TMetadata>(
  node: EditorTreeNode<TMetadata>,
  state: EditorTreeState,
  useDefaultExpansion: boolean,
): boolean {
  return (
    state.expandedIds.includes(node.id) || (useDefaultExpansion && node.expandedByDefault === true)
  );
}

function normalizeExpandedIds(ids: readonly EditorTreeNodeId[] | undefined): EditorTreeNodeId[] {
  return [...new Set(ids ?? [])].sort();
}

function validateEditorTreeNodeId(id: EditorTreeNodeId): void {
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Editor tree node ids must be non-empty strings.");
  }
}
