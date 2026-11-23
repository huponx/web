import en from "./en.json";
import vi from "./vi.json";
import i18n, { languages } from "./index";

function flat(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj).flatMap(([k, v]) =>
      typeof v === "object" && v !== null ? Object.entries(flat(v as Record<string, unknown>, `${prefix}${k}.`)) : [[`${prefix}${k}`, String(v)]],
    ),
  );
}

/** Placeholders like {{count}} of a text. */
function tokens(text: string): string[] {
  return (text.match(/\{\{\w+\}\}/g) ?? []).sort();
}

describe("translations", () => {
  it("have the same keys in every language", () => {
    expect(Object.keys(flat(vi)).sort()).toEqual(Object.keys(flat(en)).sort());
  });

  it("keep the same placeholders", () => {
    const e = flat(en);
    const v = flat(vi);
    for (const k of Object.keys(e)) expect(tokens(v[k] ?? "")).toEqual(tokens(e[k] ?? ""));
  });

  it("lists the languages that have resources", () => {
    expect(languages.map((l) => l.code)).toEqual(["en", "vi"]);
  });

  it("switches the language and sets <html lang>", async () => {
    await i18n.changeLanguage("vi");
    expect(i18n.t("login.submit")).toBe("Đăng nhập");
    expect(document.documentElement.lang).toBe("vi");
    await i18n.changeLanguage("en");
    expect(i18n.t("login.submit")).toBe("Sign in");
  });
});
