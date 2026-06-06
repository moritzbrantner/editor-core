import type { EditorEntityId } from "./entities.js";
import type { EditorTreeNode, EditorTreeNodeId } from "./tree.js";

export type EditorSelection =
  | { kind: "empty" }
  | { kind: "entity"; ids: readonly EditorEntityId[]; anchorId?: EditorEntityId }
  | { kind: "range"; anchorId: EditorEntityId; focusId: EditorEntityId }
  | { kind: "port"; entityId: EditorEntityId; portId: string }
  | {
      kind: "time";
      start: number;
      end: number;
      trackIds?: readonly EditorEntityId[];
    };

export const emptyEditorSelection: EditorSelection = { kind: "empty" };

export function createEditorEntitySelection(
  ids: readonly EditorEntityId[],
  anchorId: EditorEntityId | undefined = ids.at(-1),
): EditorSelection {
  const normalizedIds = normalizeSelectionIds(ids);
  if (normalizedIds.length === 0) {
    return emptyEditorSelection;
  }

  return {
    anchorId: anchorId && normalizedIds.includes(anchorId) ? anchorId : normalizedIds.at(-1),
    ids: normalizedIds,
    kind: "entity",
  };
}

export function getEditorSelectedEntityIds(selection: EditorSelection | null): EditorEntityId[] {
  if (!selection || selection.kind === "empty") {
    return [];
  }

  if (selection.kind === "entity") {
    return [...selection.ids];
  }

  if (selection.kind === "range") {
    return normalizeSelectionIds([selection.anchorId, selection.focusId]);
  }

  if (selection.kind === "port") {
    return [selection.entityId];
  }

  return normalizeSelectionIds(selection.trackIds ?? []);
}

export function isEditorEntitySelected(
  selection: EditorSelection | null,
  id: EditorEntityId,
): boolean {
  return getEditorSelectedEntityIds(selection).includes(id);
}

export function addEditorEntityToSelection(
  selection: EditorSelection | null,
  id: EditorEntityId,
): EditorSelection {
  return createEditorEntitySelection([...getEditorSelectedEntityIds(selection), id], id);
}

export function removeEditorEntityFromSelection(
  selection: EditorSelection | null,
  id: EditorEntityId,
): EditorSelection {
  return createEditorEntitySelection(
    getEditorSelectedEntityIds(selection).filter((selectedId) => selectedId !== id),
  );
}

export function toggleEditorEntitySelection(
  selection: EditorSelection | null,
  id: EditorEntityId,
): EditorSelection {
  return isEditorEntitySelected(selection, id)
    ? removeEditorEntityFromSelection(selection, id)
    : addEditorEntityToSelection(selection, id);
}

export function normalizeEditorSelection(
  selection: EditorSelection | null,
  exists: (id: EditorEntityId) => boolean,
): EditorSelection {
  if (!selection || selection.kind === "empty") {
    return emptyEditorSelection;
  }

  if (selection.kind === "entity") {
    const ids = selection.ids.filter(exists);
    return createEditorEntitySelection(ids, selection.anchorId);
  }

  if (selection.kind === "range") {
    return exists(selection.anchorId) && exists(selection.focusId)
      ? selection
      : emptyEditorSelection;
  }

  if (selection.kind === "port") {
    return exists(selection.entityId) ? selection : emptyEditorSelection;
  }

  const trackIds = selection.trackIds?.filter(exists);
  return {
    ...selection,
    end: Math.max(selection.start, selection.end),
    start: Math.min(selection.start, selection.end),
    trackIds: trackIds && trackIds.length > 0 ? trackIds : undefined,
  };
}

export function editorSelectionFromTreeNode(
  node: EditorTreeNode<{ entityId?: EditorEntityId }> | EditorTreeNode,
): EditorSelection {
  const entityId = getTreeNodeEntityId(node);
  return entityId ? createEditorEntitySelection([entityId]) : emptyEditorSelection;
}

export function getEditorSelectionPrimaryEntityId(
  selection: EditorSelection | null,
): EditorEntityId | null {
  const ids = getEditorSelectedEntityIds(selection);
  return ids.at(-1) ?? null;
}

export function getEditorSelectionTreeNodeId(
  selection: EditorSelection | null,
  mapEntityIdToTreeNodeId: (id: EditorEntityId) => EditorTreeNodeId | null | undefined = (id) => id,
): EditorTreeNodeId | null {
  const id = getEditorSelectionPrimaryEntityId(selection);
  return id ? (mapEntityIdToTreeNodeId(id) ?? null) : null;
}

function getTreeNodeEntityId(node: EditorTreeNode<{ entityId?: EditorEntityId }> | EditorTreeNode) {
  const metadata = node.metadata;
  if (isRecord(metadata) && typeof metadata.entityId === "string") {
    return metadata.entityId;
  }
  return node.id;
}

function normalizeSelectionIds(ids: readonly EditorEntityId[]): EditorEntityId[] {
  return [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
