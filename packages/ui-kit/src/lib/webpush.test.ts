import { keyBytes } from "./webpush";

describe("keyBytes", () => {
  it("decodes the public VAPID key (base64url, no padding) into bytes", () => {
    // 0xfb 0xff 0xfe is "-__-" in base64url ("+//+" in base64)
    expect(Array.from(keyBytes("-__-"))).toEqual([0xfb, 0xff, 0xfe]);
    expect(Array.from(keyBytes("AQI"))).toEqual([1, 2]); // padding is added back
  });
});
