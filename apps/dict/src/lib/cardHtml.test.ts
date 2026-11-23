import { cardHtml } from "./cardHtml";

describe("cardHtml", () => {
  it("keeps the structure of a card and drops the audio placeholders", () => {
    const html = cardHtml("<div>UK /a/ replace_audio_uk</div><div><i>noun</i></div><ol><li>one<ul><li><i>ex</i></li></ul></li></ol><hr>");
    expect(html).toContain("<ol><li>one<ul><li><i>ex</i></li></ul></li></ol>");
    expect(html).toContain("<hr>");
    expect(html).not.toContain("replace_audio");
  });
  it("removes scripts, handlers, links and styles", () => {
    const html = cardHtml('<div onclick="x()" style="color:red">a<script>alert(1)</script><img src=x onerror="y()"><a href="javascript:z()">b</a><iframe src="//e"></iframe></div>');
    expect(html).toBe("<div>ab</div>");
  });
  it("shows markup typed as text as text", () => {
    expect(cardHtml("<div>&lt;script&gt;x&lt;/script&gt;</div>")).toBe("<div>&lt;script&gt;x&lt;/script&gt;</div>");
  });
});
