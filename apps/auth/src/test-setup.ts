import "@testing-library/jest-dom/vitest";
import i18n from "./i18n";

// jsdom has no matchMedia, which the theme provider uses
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// the tests read English labels, whatever the language of the machine
beforeEach(async () => {
  window.localStorage.clear();
  await i18n.changeLanguage("en");
});
