import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import type * as ImageLib from "./lib/image";
import i18n from "./i18n";

// jsdom has no canvas: the shrinking of a picture (lib/image.ts) is replaced by a fixed small WebP
vi.mock("./lib/image", async (original) => ({
  ...(await original<typeof ImageLib>()),
  downscaleImage: vi.fn(async () => ({
    contentType: "image/webp",
    data: "AAAA",
  })),
}));

// jsdom has no matchMedia, ResizeObserver or pointer capture, which Radix and the theme provider use
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
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;
Element.prototype.scrollIntoView ??= () => undefined;

// ProseMirror measures the page, which jsdom does not lay out
const noRects = () =>
  ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator],
  }) as unknown as DOMRectList;
const zero = () =>
  ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => ({}),
  }) as DOMRect;
Range.prototype.getClientRects ??= noRects;
Range.prototype.getBoundingClientRect ??= zero;
Element.prototype.getClientRects ??= noRects;
document.elementFromPoint ??= () => null;

// the tests read English labels, whatever the language of the machine
beforeEach(async () => {
  window.localStorage.clear();
  await i18n.changeLanguage("en");
});
