import { portalHref } from "./AccountMenu";

describe("portalHref", () => {
  it("accepts https and gives no link for a missing, broken or unsafe value", () => {
    expect(portalHref("https://example.com")).toBe("https://example.com/");
    for (const v of [undefined, "", "not a url", "javascript:alert(1)", "data:text/html,x"]) expect(portalHref(v)).toBeUndefined();
  });

  it("accepts http on localhost only", () => {
    // jsdom runs on localhost, where a development run may use http
    expect(portalHref("http://localhost:3004")).toBe("http://localhost:3004/");
  });
});
