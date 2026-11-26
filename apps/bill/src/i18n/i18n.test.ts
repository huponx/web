import en from "./en.json";
import vi from "./vi.json";
import i18n, { languages } from "./index";

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

/** Placeholders like {{email}} and tags like <strong> of a text. */
function tokens(text: string): string[] {
  return (text.match(/\{\{\w+\}\}|<\/?\w+>/g) ?? []).sort();
}

function flat(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj).flatMap(([k, v]) =>
      typeof v === "object" && v !== null ? Object.entries(flat(v as Record<string, unknown>, `${prefix}${k}.`)) : [[`${prefix}${k}`, String(v)]],
    ),
  );
}

describe("translations", () => {
  it("have the same keys in every language", () => {
    expect(keys(vi).sort()).toEqual(keys(en).sort());
  });

  it("keep the same placeholders and tags", () => {
    const e = flat(en);
    const v = flat(vi);
    for (const k of Object.keys(e)) expect(tokens(v[k] ?? "")).toEqual(tokens(e[k] ?? ""));
  });

  it("lists the languages that have resources", () => {
    expect(languages.map((l) => l.code)).toEqual(["en", "vi"]);
  });

  it("switches the language, sets <html lang> and remembers the choice", async () => {
    await i18n.changeLanguage("vi");
    expect(i18n.t("nav.invoices")).toBe("Hóa đơn");
    expect(document.documentElement.lang).toBe("vi");
    expect(window.localStorage.getItem("lang")).toBe("vi");
    await i18n.changeLanguage("en");
    expect(i18n.t("nav.invoices")).toBe("Invoices");
    expect(document.documentElement.lang).toBe("en");
  });

  it("uses the base language of a regional one and falls back to English", async () => {
    await i18n.changeLanguage("vi-VN");
    expect(i18n.t("nav.invoices")).toBe("Hóa đơn");
    await i18n.changeLanguage("fr");
    expect(i18n.t("nav.invoices")).toBe("Invoices");
  });
});
