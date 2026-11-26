import { useCallback, useEffect, useRef, useState } from "react";
import { SAVED_CHANGED, UNCATEGORIZED, useDictionary } from "../api";
import type { Category, CategoryList } from "../api";

/** Tells the lists and the category pickers that the words or the categories changed (they read again). */
export function notifySavedChanged(): void {
  window.dispatchEvent(new Event(SAVED_CHANGED));
}

/** The categories of the user, read again when the saved words change anywhere in the app. */
export function useCategories() {
  const api = useDictionary();
  const [data, setData] = useState<CategoryList>({ categories: [] });
  const [loaded, setLoaded] = useState(false);
  const seq = useRef(0);
  const reload = useCallback(() => {
    const mine = ++seq.current;
    api
      .listCategories()
      .then((r) => {
        if (mine !== seq.current) return;
        setData({ ...r, categories: r.categories ?? [] });
        setLoaded(true);
      })
      .catch(() => undefined); // the lists work without categories
  }, [api]);
  useEffect(reload, [reload]);
  useEffect(() => {
    window.addEventListener(SAVED_CHANGED, reload);
    return () => window.removeEventListener(SAVED_CHANGED, reload);
  }, [reload]);
  return { categories: data.categories, list: data, loaded, reload };
}

const KEY = "dict:category:";

function read(name: string): string {
  try {
    return window.localStorage.getItem(KEY + name) ?? "";
  } catch {
    return "";
  }
}

function write(name: string, value: string): void {
  try {
    if (value) window.localStorage.setItem(KEY + name, value);
    else window.localStorage.removeItem(KEY + name);
  } catch {
    // no storage (private window): the choice is only kept until the page goes
  }
}

/**
 * The category filter of a page ("" = all, UNCATEGORIZED, or a category id), remembered per page. A remembered
 * category that is gone counts as "all" once the categories are loaded.
 */
export function usePersistedCategory(
  name: "saved" | "export" | "review",
  categories: Category[],
  loaded: boolean,
) {
  const [stored, setStored] = useState(() => read(name));
  const value =
    stored === "" ||
    stored === UNCATEGORIZED ||
    !loaded ||
    categories.some((c) => c.id === stored)
      ? stored
      : "";
  const set = useCallback(
    (v: string) => {
      setStored(v);
      write(name, v);
    },
    [name],
  );
  return [value, set] as const;
}

/** The categories the user picked last on the lookup page (ids, only the ones that still exist are used). */
export function readLookupCategories(): string[] {
  try {
    const v: unknown = JSON.parse(
      window.localStorage.getItem(KEY + "lookup") ?? "[]",
    );
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function writeLookupCategories(ids: string[]): void {
  write("lookup", ids.length ? JSON.stringify(ids) : "");
}
