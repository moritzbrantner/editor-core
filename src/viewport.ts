import type { EditorBounds, EditorPoint } from "./entities.js";

export type EditorViewportState = {
  x: number;
  y: number;
  zoom: number;
};

export type EditorTimelineViewportState = {
  start: number;
  end: number;
  pixelsPerUnit: number;
};

export type EditorViewportClamp = {
  minZoom?: number;
  maxZoom?: number;
};

export type EditorSnapTarget = {
  value: number;
  id?: string;
  kind?: string;
};

export type EditorSnapResult = {
  value: number;
  snapped: boolean;
  target?: EditorSnapTarget;
};

export type FitEditorBoundsOptions = EditorViewportClamp & {
  padding?: number;
  viewportSize: {
    height: number;
    width: number;
  };
};

export function createEditorViewportState(
  state: Partial<EditorViewportState> = {},
): EditorViewportState {
  return {
    x: state.x ?? 0,
    y: state.y ?? 0,
    zoom: clampZoom(state.zoom ?? 1),
  };
}

export function panEditorViewport(
  viewport: EditorViewportState,
  delta: EditorPoint,
): EditorViewportState {
  return {
    ...viewport,
    x: viewport.x + delta.x,
    y: viewport.y + delta.y,
  };
}

export function zoomEditorViewportAtPoint(
  viewport: EditorViewportState,
  zoom: number,
  point: EditorPoint,
  clamp: EditorViewportClamp = {},
): EditorViewportState {
  const nextZoom = clampZoom(zoom, clamp);
  const documentPoint = screenPointToEditorPoint(point, viewport);
  return {
    x: point.x - documentPoint.x * nextZoom,
    y: point.y - documentPoint.y * nextZoom,
    zoom: nextZoom,
  };
}

export function screenPointToEditorPoint(
  point: EditorPoint,
  viewport: EditorViewportState,
): EditorPoint {
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom,
  };
}

export function editorPointToScreenPoint(
  point: EditorPoint,
  viewport: EditorViewportState,
): EditorPoint {
  return {
    x: point.x * viewport.zoom + viewport.x,
    y: point.y * viewport.zoom + viewport.y,
  };
}

export function fitEditorBoundsInViewport(
  bounds: EditorBounds,
  options: FitEditorBoundsOptions,
): EditorViewportState {
  const padding = options.padding ?? 0;
  const availableWidth = Math.max(1, options.viewportSize.width - padding * 2);
  const availableHeight = Math.max(1, options.viewportSize.height - padding * 2);
  const zoom = clampZoom(
    Math.min(
      availableWidth / Math.max(1, bounds.width),
      availableHeight / Math.max(1, bounds.height),
    ),
    options,
  );
  return {
    x: (options.viewportSize.width - bounds.width * zoom) / 2 - bounds.x * zoom,
    y: (options.viewportSize.height - bounds.height * zoom) / 2 - bounds.y * zoom,
    zoom,
  };
}

export function unionEditorBounds(bounds: readonly EditorBounds[]): EditorBounds | null {
  if (bounds.length === 0) {
    return null;
  }

  const minX = Math.min(...bounds.map((bound) => bound.x));
  const minY = Math.min(...bounds.map((bound) => bound.y));
  const maxX = Math.max(...bounds.map((bound) => bound.x + bound.width));
  const maxY = Math.max(...bounds.map((bound) => bound.y + bound.height));
  return {
    height: maxY - minY,
    width: maxX - minX,
    x: minX,
    y: minY,
  };
}

export function doEditorBoundsIntersect(left: EditorBounds, right: EditorBounds): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

export function snapEditorValue(
  value: number,
  targets: readonly EditorSnapTarget[],
  threshold = 0,
): EditorSnapResult {
  let closest: EditorSnapTarget | undefined;
  let closestDistance = Infinity;

  for (const target of targets) {
    const distance = Math.abs(target.value - value);
    if (distance < closestDistance) {
      closest = target;
      closestDistance = distance;
    }
  }

  if (closest && closestDistance <= threshold) {
    return {
      snapped: true,
      target: closest,
      value: closest.value,
    };
  }

  return {
    snapped: false,
    value,
  };
}

export function snapEditorPoint(
  point: EditorPoint,
  targets: {
    x?: readonly EditorSnapTarget[];
    y?: readonly EditorSnapTarget[];
  },
  threshold = 0,
): EditorPoint {
  return {
    x: snapEditorValue(point.x, targets.x ?? [], threshold).value,
    y: snapEditorValue(point.y, targets.y ?? [], threshold).value,
  };
}

export function revealEditorBounds(
  bounds: readonly EditorBounds[],
  options: FitEditorBoundsOptions,
): EditorViewportState | null {
  const union = unionEditorBounds(bounds);
  return union ? fitEditorBoundsInViewport(union, options) : null;
}

export function createEditorTimelineViewportState(
  state: Partial<EditorTimelineViewportState> = {},
): EditorTimelineViewportState {
  const start = state.start ?? 0;
  const end = Math.max(start, state.end ?? start + 1);
  const pixelsPerUnit = state.pixelsPerUnit ?? 1;
  return { end, pixelsPerUnit, start };
}

export function editorTimeToPixel(time: number, viewport: EditorTimelineViewportState): number {
  return (time - viewport.start) * viewport.pixelsPerUnit;
}

export function editorPixelToTime(pixel: number, viewport: EditorTimelineViewportState): number {
  return viewport.start + pixel / viewport.pixelsPerUnit;
}

export function panEditorTimelineViewport(
  viewport: EditorTimelineViewportState,
  deltaUnits: number,
): EditorTimelineViewportState {
  return {
    ...viewport,
    end: viewport.end + deltaUnits,
    start: viewport.start + deltaUnits,
  };
}

export function zoomEditorTimelineViewportAtPixel(
  viewport: EditorTimelineViewportState,
  pixelsPerUnit: number,
  pixel: number,
): EditorTimelineViewportState {
  const anchorTime = editorPixelToTime(pixel, viewport);
  const nextPixelsPerUnit = Math.max(Number.EPSILON, pixelsPerUnit);
  const start = anchorTime - pixel / nextPixelsPerUnit;
  const duration = (viewport.end - viewport.start) * (viewport.pixelsPerUnit / nextPixelsPerUnit);
  return {
    end: start + duration,
    pixelsPerUnit: nextPixelsPerUnit,
    start,
  };
}

function clampZoom(zoom: number, clamp: EditorViewportClamp = {}): number {
  return Math.min(clamp.maxZoom ?? Infinity, Math.max(clamp.minZoom ?? Number.EPSILON, zoom));
}
