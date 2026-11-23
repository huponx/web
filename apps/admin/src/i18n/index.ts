import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import vi from "./vi.json";

/** Languages of the admin. To add one: a `<code>.json` next to these files and an entry here. */
export const languages = [
  { code: "en", label: "English" },
  { code: "vi", label: "Tiếng Việt" },
] as const;

export type LanguageCode = (typeof languages)[number]["code"];

export const LANGUAGE_STORAGE_KEY = "lang";

function syncHtmlLang(lng: string | undefined) {
  if (lng) document.documentElement.lang = lng;
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, vi: { translation: vi } },
    supportedLngs: languages.map((l) => l.code),
    // vi-VN, en-GB, ... use the base language
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    fallbackLng: "en",
    // the choice of the user first, then the language of the browser
    detection: { order: ["localStorage", "navigator"], lookupLocalStorage: LANGUAGE_STORAGE_KEY, caches: ["localStorage"] },
    interpolation: { escapeValue: false }, // React escapes
    returnNull: false,
  });

syncHtmlLang(i18n.resolvedLanguage);
i18n.on("languageChanged", () => syncHtmlLang(i18n.resolvedLanguage));

export default i18n;
