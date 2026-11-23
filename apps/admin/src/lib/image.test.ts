import { splitDataUrl, squareCrop } from "./image";

describe("squareCrop", () => {
  it("centers a landscape picture", () => {
    expect(squareCrop(400, 200)).toEqual({ sx: 100, sy: 0, side: 200 });
  });
  it("centers a portrait picture", () => {
    expect(squareCrop(200, 301)).toEqual({ sx: 0, sy: 50, side: 200 });
  });
  it("keeps a square picture", () => {
    expect(squareCrop(64, 64)).toEqual({ sx: 0, sy: 0, side: 64 });
  });
});

describe("splitDataUrl", () => {
  it("returns the media type and the base64 part", () => {
    expect(splitDataUrl("data:image/webp;base64,AAAA")).toEqual({ mime: "image/webp", base64: "AAAA" });
  });
  it("refuses anything else", () => {
    expect(() => splitDataUrl("http://x/y.png")).toThrow();
  });
});
