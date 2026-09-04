import { describe, expect, test } from "vitest";
import {
  createEditorViewportState,
  doEditorBoundsIntersect,
  editorPointToScreenPoint,
  fitEditorBoundsInViewport,
  panEditorViewport,
  screenPointToEditorPoint,
  snapEditorPoint,
  snapEditorValue,
  unionEditorBounds,
  zoomEditorViewportAtPoint,
} from "./viewport.js";

describe("editor viewport", () => {
  test("pans, zooms around a point, and round-trips coordinates", () => {
    let viewport = createEditorViewportState({ x: 10, y: 20, zoom: 2 });
    viewport = panEditorViewport(viewport, { x: 5, y: -10 });
    expect(viewport).toEqual({ x: 15, y: 10, zoom: 2 });

    const documentPoint = screenPointToEditorPoint({ x: 25, y: 30 }, viewport);
    expect(editorPointToScreenPoint(documentPoint, viewport)).toEqual({ x: 25, y: 30 });

    const zoomed = zoomEditorViewportAtPoint(viewport, 4, { x: 25, y: 30 });
    expect(screenPointToEditorPoint({ x: 25, y: 30 }, zoomed)).toEqual(documentPoint);
  });

  test("fits and unions bounds", () => {
    expect(
      unionEditorBounds([
        { height: 10, width: 10, x: 0, y: 0 },
        { height: 5, width: 5, x: 20, y: 10 },
      ]),
    ).toEqual({ height: 15, width: 25, x: 0, y: 0 });

    expect(
      fitEditorBoundsInViewport(
        { height: 50, width: 100, x: 0, y: 0 },
        { viewportSize: { height: 100, width: 200 } },
      ),
    ).toEqual({ x: 0, y: 0, zoom: 2 });

    expect(
      doEditorBoundsIntersect(
        { height: 10, width: 10, x: 0, y: 0 },
        { height: 10, width: 10, x: 5, y: 5 },
      ),
    ).toBe(true);
  });

  test("snaps scalar and 2D values without defining domain semantics", () => {
    expect(snapEditorValue(9, [{ value: 10, id: "guide" }], 2)).toEqual({
      snapped: true,
      target: { value: 10, id: "guide" },
      value: 10,
    });
    expect(snapEditorValue(7, [{ value: 10 }], 2)).toEqual({ snapped: false, value: 7 });
    expect(snapEditorPoint({ x: 9, y: 21 }, { x: [{ value: 10 }], y: [{ value: 20 }] }, 2)).toEqual(
      { x: 10, y: 20 },
    );
  });
});
