// The math of the avatar crop dialog, kept free of the DOM so it can be tested.

export const MAX_ZOOM = 4;

/** A square region of the picture, in the pixels of the original. */
export interface Crop {
  sx: number;
  sy: number;
  side: number;
}

/** What the user sees: 1x fits the short edge of the picture in the frame; cx/cy is the center of the region. */
export interface CropView {
  zoom: number;
  cx: number;
  cy: number;
}

/** The side of the region at a zoom level. */
export function sideAt(width: number, height: number, zoom: number): number {
  return Math.min(width, height) / zoom;
}

/** The view that selects the whole short edge, centered. */
export function initialView(width: number, height: number): CropView {
  return { zoom: 1, cx: width / 2, cy: height / 2 };
}

/** Keeps the zoom in range and the region inside the picture. */
export function clampView(width: number, height: number, v: CropView): CropView {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom));
  const half = sideAt(width, height, zoom) / 2;
  return {
    zoom,
    cx: Math.min(width - half, Math.max(half, v.cx)),
    cy: Math.min(height - half, Math.max(half, v.cy)),
  };
}

/** The region in whole pixels of the original, always inside it. */
export function cropFromView(width: number, height: number, v: CropView): Crop {
  const c = clampView(width, height, v);
  const side = Math.max(1, Math.min(Math.min(width, height), Math.round(sideAt(width, height, c.zoom))));
  const sx = Math.min(width - side, Math.max(0, Math.round(c.cx - side / 2)));
  const sy = Math.min(height - side, Math.max(0, Math.round(c.cy - side / 2)));
  return { sx, sy, side };
}

/** Changes the zoom around the current center. */
export function zoomView(width: number, height: number, v: CropView, zoom: number): CropView {
  return clampView(width, height, { ...v, zoom });
}

/** Moves the region by a distance in frame pixels (the picture follows the pointer, so the region goes the other way). */
export function panView(width: number, height: number, v: CropView, dxPx: number, dyPx: number, frame: number): CropView {
  const perPx = sideAt(width, height, v.zoom) / frame;
  return clampView(width, height, { ...v, cx: v.cx - dxPx * perPx, cy: v.cy - dyPx * perPx });
}
