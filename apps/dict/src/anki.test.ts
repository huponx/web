import { describe, expect, it } from "vitest";
import {
  cardBack,
  cardsHtml,
  cardText,
  combinedCardBack,
  escapeHtml,
} from "./anki";
import { parseWords, serviceCode } from "./api";
import type { Word } from "./api";

const hello: Word = {
  text: "hello",
  phonetic: "",
  phoneticUk: "/həˈləʊ/",
  phoneticUs: "/həˈloʊ/",
  audioUk: "https://api.dictionaryapi.dev/uk.mp3",
  audioUs: "https://api.dictionaryapi.dev/us.mp3",
  partOfSpeech: ["exclamation", "noun"],
  meanings: [
    {
      definition: "used as a greeting",
      examples: ["Hello, John!"],
      machineTranslated: false,
    },
    {
      definition: "<b>a call</b> & more",
      examples: [],
      machineTranslated: false,
    },
  ],
};

describe("cardBack", () => {
  it("has phonetics with the audio placeholders, parts of speech and numbered meanings", () => {
    const html = cardBack(hello);
    expect(html).toContain("UK /həˈləʊ/ replace_audio_uk");
    expect(html).toContain("US /həˈloʊ/ replace_audio_us");
    expect(html).toContain("<i>exclamation, noun</i>");
    expect(html).toContain(
      "<ol><li>used as a greeting<ul><li><i>Hello, John!</i></li></ul></li>",
    );
    expect(html).not.toContain("\n");
  });

  it("escapes the text of the sources", () => {
    expect(cardBack(hello)).toContain("&lt;b&gt;a call&lt;/b&gt; &amp; more");
    expect(escapeHtml(`"<&>"`)).toBe("&quot;&lt;&amp;&gt;&quot;");
  });

  it("leaves the placeholders out for a card pasted by hand, and when there is no audio", () => {
    expect(cardBack(hello, { placeholders: false })).not.toContain(
      "replace_audio",
    );
    const silent = cardBack({ ...hello, audioUk: "", audioUs: "" });
    expect(silent).not.toContain("replace_audio");
    expect(silent).toContain("UK /həˈləʊ/");
  });

  it("uses the plain phonetic when UK and US are not told apart", () => {
    const w: Word = {
      ...hello,
      phonetic: "/x/",
      phoneticUk: "",
      phoneticUs: "",
      audioUk: "",
      audioUs: "",
    };
    expect(cardBack(w)).toContain("UK /x/");
  });
});

describe("copy formats", () => {
  it("cardText is front, a tab, the back without placeholders", () => {
    const [front, back] = cardText(hello).split("\t");
    expect(front).toBe("hello");
    expect(back).toBe(cardBack(hello, { placeholders: false }));
  });

  it("cardsHtml separates the cards with a rule", () => {
    const html = cardsHtml([hello, { ...hello, text: "a<b" }]);
    expect(html.split("<hr>")).toHaveLength(2);
    expect(html).toContain("<b>a&lt;b</b>");
  });
});

describe("parseWords", () => {
  it("splits on commas and lines, trims and drops repeats", () => {
    expect(parseWords(" hello, World;\nhello\n\n  ice   cream ")).toEqual([
      "hello",
      "World",
      "ice cream",
    ]);
    expect(parseWords("  ")).toEqual([]);
  });
});

describe("serviceCode", () => {
  it("reads the code at the start of the message", () => {
    expect(serviceCode(new Error("MAX_SAVED_WORDS_REACHED: 100"))).toBe(
      "MAX_SAVED_WORDS_REACHED",
    );
    expect(serviceCode(new Error("other"))).toBeUndefined();
    expect(serviceCode("x")).toBeUndefined();
  });
});

describe("combinedCardBack", () => {
  const vi: Word = {
    ...hello,
    partOfSpeech: ["thán từ"],
    meanings: [
      { definition: "xin chào", examples: [], machineTranslated: false },
    ],
  };

  it("puts English first, a rule, then Vietnamese without a second phonetics line", () => {
    const html = combinedCardBack(hello, vi);
    const [first, second] = html.split("<hr>");
    expect(first).toContain("used as a greeting");
    expect(first).toContain("replace_audio_uk");
    expect(second).toContain("xin chào");
    expect(second).not.toContain("replace_audio");
    expect(second).not.toContain("UK ");
  });

  it("has no rule when one dictionary is missing", () => {
    expect(combinedCardBack(hello, undefined)).not.toContain("<hr>");
    expect(combinedCardBack(undefined, vi)).toContain("xin chào");
    expect(combinedCardBack(undefined, undefined)).toBe("");
  });
});
