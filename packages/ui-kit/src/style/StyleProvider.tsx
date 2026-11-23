import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

/** The look of the apps, one for the whole system (an administrator picks it); light/dark is separate (the theme). */
export type UIStyle = "saas" | "glass" | "mono";

export const UI_STYLES: readonly UIStyle[] = ["saas", "glass", "mono"];
export const DEFAULT_UI_STYLE: UIStyle = "saas";
export const STYLE_STORAGE_KEY = "ui-style";

/** The colour set of a style; the same six for every style (an administrator picks one per style). */
export type UIPalette = "aurora" | "ocean" | "sunset" | "mint" | "rose" | "graphite";

export const UI_PALETTES: readonly UIPalette[] = ["aurora", "ocean", "sunset", "mint", "rose", "graphite"];
export const DEFAULT_UI_PALETTE: UIPalette = "aurora";
export const PALETTE_STORAGE_KEY = "ui-palette";

export function isUIPalette(v: unknown): v is UIPalette {
  return typeof v === "string" && (UI_PALETTES as readonly string[]).includes(v);
}

export function isUIStyle(v: unknown): v is UIStyle {
  return typeof v === "string" && (UI_STYLES as readonly string[]).includes(v);
}

interface StyleContextValue {
  style: UIStyle;
  /** Applies the style now and keeps it for the next visit (no flash before the system setting is read). */
  setStyle: (style: UIStyle) => void;
  /** The palette of the style in use. */
  palette: UIPalette;
  setPalette: (palette: UIPalette) => void;
}

const StyleContext = createContext<StyleContextValue | undefined>(undefined);

function readStored(key: string): UIStyle {
  try {
    const v = window.localStorage.getItem(key);
    return isUIStyle(v) ? v : DEFAULT_UI_STYLE;
  } catch {
    return DEFAULT_UI_STYLE;
  }
}

function readStoredPalette(key: string): UIPalette {
  try {
    const v = window.localStorage.getItem(key);
    return isUIPalette(v) ? v : DEFAULT_UI_PALETTE;
  } catch {
    return DEFAULT_UI_PALETTE;
  }
}

/** Puts the palette on <html> as `data-palette`. */
export function applyPalette(palette: UIPalette) {
  document.documentElement.dataset.palette = palette;
}

/** Puts the style on <html> as `data-style` (the tokens of styles.css hang on it). */
export function applyStyle(style: UIStyle) {
  document.documentElement.dataset.style = style;
}

/**
 * The style of the apps. Like ThemeProvider it adds no <style> or inline script (CSP): the attribute is set from
 * here, and the first paint is handled by `theme-init.js`, which reads the same key.
 */
export function StyleProvider({
  children,
  storageKey = STYLE_STORAGE_KEY,
  paletteStorageKey = PALETTE_STORAGE_KEY,
}: {
  children: ReactNode;
  storageKey?: string;
  paletteStorageKey?: string;
}) {
  const [style, setStyleState] = useState<UIStyle>(() => readStored(storageKey));
  const [palette, setPaletteState] = useState<UIPalette>(() => readStoredPalette(paletteStorageKey));

  useEffect(() => {
    applyStyle(style);
  }, [style]);

  useEffect(() => {
    applyPalette(palette);
  }, [palette]);

  const setPalette = useCallback(
    (next: UIPalette) => {
      if (!isUIPalette(next)) return;
      setPaletteState(next);
      try {
        window.localStorage.setItem(paletteStorageKey, next);
      } catch {
        // storage can be blocked: the palette then lasts for this page only
      }
    },
    [paletteStorageKey],
  );

  const setStyle = useCallback(
    (next: UIStyle) => {
      if (!isUIStyle(next)) return;
      setStyleState(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // storage can be blocked: the style then lasts for this page only
      }
    },
    [storageKey],
  );

  const value = useMemo(() => ({ style, setStyle, palette, setPalette }), [style, setStyle, palette, setPalette]);
  return <StyleContext.Provider value={value}>{children}</StyleContext.Provider>;
}

export function useUIStyle(): StyleContextValue {
  const ctx = useContext(StyleContext);
  if (!ctx) throw new Error("useUIStyle must be used inside <StyleProvider>");
  return ctx;
}

/** What the system endpoints answer (`/auth-api/ui-style`, `/api/ui-style`): the style and the palette of each style. */
export interface SystemStyleReply {
  uiStyle?: string;
  uiPalettes?: Record<string, string>;
}

/** The style in use and its palette, from a reply of the system endpoints (undefined parts stay unknown). */
export function systemStyleOf(r: SystemStyleReply): { style?: string; palette?: string } {
  return { style: r.uiStyle, palette: r.uiStyle ? r.uiPalettes?.[r.uiStyle] : undefined };
}

/**
 * Reads the system style once (`load` is the app's call) and applies it with its palette. A failed call or an
 * unknown value leaves the cached one alone, so a broken endpoint never changes the look.
 */
export function useSystemStyle(load: () => Promise<{ style?: string; palette?: string }>) {
  const { setStyle, setPalette } = useUIStyle();
  useEffect(() => {
    let live = true;
    load().then(
      (v) => {
        if (!live) return;
        if (isUIStyle(v.style)) setStyle(v.style);
        // a missing palette of a known style is the default (an older server sends none)
        if (isUIStyle(v.style)) setPalette(isUIPalette(v.palette) ? v.palette : DEFAULT_UI_PALETTE);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
    // once per mount: `load` is a new function every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
