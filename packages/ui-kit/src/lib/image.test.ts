import { MAX_INPUT_BYTES, splitDataUrl, squareCrop, validateImage } from "./image";

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

describe("validateImage", () => {
  it("takes a small PNG", () => {
    expect(() => validateImage(new File(["x"], "a.png", { type: "image/png" }))).not.toThrow();
  });
  it("refuses another type", () => {
    expect(() => validateImage(new File(["x"], "a.gif", { type: "image/gif" }))).toThrow(expect.objectContaining({ code: "type" }));
  });
  it("refuses a file above the limit", () => {
    const big = new File([new Uint8Array(MAX_INPUT_BYTES + 1)], "a.png", { type: "image/png" });
    expect(() => validateImage(big)).toThrow(expect.objectContaining({ code: "size" }));
  });
});
