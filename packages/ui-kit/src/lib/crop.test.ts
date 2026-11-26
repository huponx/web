import { clampView, cropFromView, initialView, MAX_ZOOM, panView, zoomView } from "./crop";

describe("cropFromView", () => {
  it("at 1x selects the short edge of a landscape picture, centered", () => {
    expect(cropFromView(400, 200, initialView(400, 200))).toEqual({ sx: 100, sy: 0, side: 200 });
  });
  it("at 1x selects the short edge of a portrait picture, centered", () => {
    expect(cropFromView(200, 300, initialView(200, 300))).toEqual({ sx: 0, sy: 50, side: 200 });
  });
  it("selects all of a square picture at 1x", () => {
    expect(cropFromView(64, 64, initialView(64, 64))).toEqual({ sx: 0, sy: 0, side: 64 });
  });
  it("halves the side at 2x", () => {
    expect(cropFromView(400, 200, { zoom: 2, cx: 200, cy: 100 })).toEqual({ sx: 150, sy: 50, side: 100 });
  });
  it("never leaves the picture, whatever the view says", () => {
    expect(cropFromView(400, 200, { zoom: 2, cx: -50, cy: 900 })).toEqual({ sx: 0, sy: 100, side: 100 });
    expect(cropFromView(400, 200, { zoom: 9, cx: 999, cy: 100 }).side).toBe(50);
  });
});

describe("clampView", () => {
  it("limits the zoom to 1..MAX_ZOOM", () => {
    expect(clampView(300, 300, { zoom: 0.2, cx: 150, cy: 150 }).zoom).toBe(1);
    expect(clampView(300, 300, { zoom: 40, cx: 150, cy: 150 }).zoom).toBe(MAX_ZOOM);
  });
  it("pins the center so the region fits", () => {
    expect(clampView(400, 200, { zoom: 1, cx: 0, cy: 0 })).toEqual({ zoom: 1, cx: 100, cy: 100 });
  });
});

describe("panView", () => {
  it("moves the region opposite to the drag", () => {
    const v = panView(400, 200, { zoom: 2, cx: 200, cy: 100 }, 10, 0, 100); // side 100 -> 1 image px per frame px
    expect(v.cx).toBe(190);
  });
  it("stops at the edge of the picture", () => {
    const v = panView(400, 200, { zoom: 2, cx: 200, cy: 100 }, -100000, 100000, 100);
    expect(cropFromView(400, 200, v)).toEqual({ sx: 300, sy: 0, side: 100 });
  });
  it("cannot move a 1x region along the short axis", () => {
    const v = panView(400, 200, initialView(400, 200), 0, 50, 100);
    expect(v.cy).toBe(100);
  });
});

describe("zoomView", () => {
  it("keeps the center when it still fits", () => {
    expect(zoomView(400, 200, { zoom: 1, cx: 150, cy: 100 }, 2)).toEqual({ zoom: 2, cx: 150, cy: 100 });
  });
});
