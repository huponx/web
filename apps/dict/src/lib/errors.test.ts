import { ApiError } from "@huponx/auth-client";
import i18n from "../i18n";
import { errorMessage, Localized } from "./errors";

describe("errorMessage", () => {
  afterEach(() => i18n.changeLanguage("en"));

  // a component keeps the error, not its text, so a change of the language changes the text on screen
  it("translates the same kept error in the language of the moment", async () => {
    const kept = [new Localized("lookup.empty"), new ApiError(404, "not_found", "word not found", "word_not_found")];
    await i18n.changeLanguage("en");
    const en = kept.map((e) => errorMessage(e, i18n.t));
    await i18n.changeLanguage("vi");
    const vi = kept.map((e) => errorMessage(e, i18n.t));
    expect(vi[0]).not.toBe(en[0]);
    expect(vi[1]).toBe("Không có mục từ cho từ này.");
    expect(en[1]).toBe("No entry for this word.");
  });
});
