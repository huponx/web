import { cardHtml, cardViewHtml, fromEditorHtml, imageIds, toEditorHtml } from "./cardHtml";

const ID = "0b8c2d5e-3f4a-4b6c-8d7e-1a2b3c4d5e6f";

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
  it("keeps an image of the card and nothing else of an img", () => {
    expect(cardHtml(`<div><img src="dictimg:${ID}" onerror="x()" style="width:9999px"></div>`)).toBe(`<div><img src="dictimg:${ID}"></div>`);
    expect(cardHtml('<img src="http://evil.example/a.png"><img src="javascript:x()"><img src="data:image/png;base64,AA"><img src="dictimg:../../x">')).toBe("");
  });
  it("shows an image through data-dictimg, so the page never loads the reference", () => {
    expect(cardViewHtml(`<img src="dictimg:${ID}">`)).toBe(`<img data-dictimg="${ID}" alt="">`);
    expect(imageIds(`<img src="dictimg:${ID}"><img src="dictimg:${ID}">`)).toEqual([ID]);
  });
  it("turns the audio placeholders into chips for the editor and back", () => {
    const html = toEditorHtml("<div>UK /a/ replace_audio_uk &nbsp; US replace_audio_us</div>");
    expect(html).toBe('<p>UK /a/ <span data-audio-slot="uk"></span> &nbsp; US <span data-audio-slot="us"></span></p>');
    expect(fromEditorHtml(html)).toBe("<p>UK /a/ replace_audio_uk &nbsp; US replace_audio_us</p>");
  });
  it("round trips a card of the editor and gives one line", () => {
    const card = `<p><b>bold</b> <u>u</u></p><ol><li>one<ul><li><i>ex</i></li></ul></li></ol><hr><p><img src="dictimg:${ID}"></p>`;
    expect(fromEditorHtml(toEditorHtml(card))).toBe(card);
    expect(fromEditorHtml("<p>a</p>\n<p>b</p>")).not.toContain("\n");
  });
  it("reads old cards: divs are paragraphs, small and sup lose their format", () => {
    expect(toEditorHtml("<div>a <small>b</small> x<sup>2</sup></div>")).toBe("<p>a b x2</p>");
  });
});

describe("image width", () => {
  const id = "3689c815-fd04-45ee-882b-1e8c945ddaa7";
  it("keeps a valid width through the editor and the view, drops a bad one", () => {
    expect(fromEditorHtml(`<p><img data-dictimg="${id}" width="200"></p>`)).toBe(`<p><img src="dictimg:${id}" width="200"></p>`);
    expect(cardViewHtml(`<img src="dictimg:${id}" width="200">`)).toBe(`<img data-dictimg="${id}" width="200" alt="">`);
    expect(toEditorHtml(`<img src="dictimg:${id}" width="9999999">`)).toBe(`<img src="dictimg:${id}">`);
  });
});
