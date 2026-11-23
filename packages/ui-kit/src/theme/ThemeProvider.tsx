import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

interface ThemeContextValue {
  /** The choice of the user (`system` follows the operating system). */
  theme: Theme;
  /** What is applied now: `light` or `dark`. */
  resolved: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const query = "(prefers-color-scheme: dark)";

function systemTheme(): ResolvedTheme {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches ? "dark" : "light";
}

function readStored(key: string): Theme {
  try {
    const v = window.localStorage.getItem(key);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

/** Puts the theme on <html>: the `dark` class (Tailwind) and `color-scheme` (native controls, scrollbars). */
export function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

/**
 * Light, dark or system theme. It does not add a <style> element or an inline script (the CSP of the apps
 * forbids both): the class is toggled from here, and the first paint is handled by `theme-init.js`.
 */
export function ThemeProvider({ children, storageKey = THEME_STORAGE_KEY }: { children: ReactNode; storageKey?: string }) {
  const [theme, setThemeState] = useState<Theme>(() => readStored(storageKey));
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);
  const resolved: ResolvedTheme = theme === "system" ? system : theme;

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const onChange = () => setSystem(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // storage can be blocked: the choice then lasts for this page only
      }
    },
    [storageKey],
  );

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
