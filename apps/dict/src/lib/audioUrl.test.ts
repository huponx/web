import { CAMBRIDGE_ORIGIN, normalizeAudioInput } from "./audioUrl";

describe("normalizeAudioInput", () => {
  const path = "/media/english/uk_pron/u/ukh/ukhef/ukheft_029.mp3";

  it.each([
    ["a <source> tag", `<source type="audio/mpeg" src="${path}">`],
    [
      "a <source> tag with single quotes",
      `<source type='audio/mpeg' src='${path}'/>`,
    ],
    ["an <audio> tag", `<audio><source src="${path}"></audio>`],
    ["the src with its quotes", `"${path}"`],
    ["the bare path", `  ${path}  `],
  ])("turns %s of Cambridge into a full URL", (_name, raw) => {
    expect(normalizeAudioInput(raw)).toBe(CAMBRIDGE_ORIGIN + path);
  });

  it("takes the src of a tag with a full URL as it is", () => {
    expect(
      normalizeAudioInput(`<source src="https://api.dictionaryapi.dev/a.mp3">`),
    ).toBe("https://api.dictionaryapi.dev/a.mp3");
  });

  it("leaves other input alone (the editor rejects it)", () => {
    expect(normalizeAudioInput("  https://x.example/a.mp3 ")).toBe(
      "https://x.example/a.mp3",
    );
    expect(normalizeAudioInput("/other/a.mp3")).toBe("/other/a.mp3");
    expect(normalizeAudioInput("<source type=audio>")).toBe(
      "<source type=audio>",
    );
    expect(normalizeAudioInput("")).toBe("");
  });
});
