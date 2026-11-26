import { useCallback, useEffect, useRef, useState } from "react";
import { SAVED_CHANGED, useDictionary } from "../api";
import type { MyStorage } from "../api";

/**
 * What the user stores (content, images, audio) against the limits, read again when the saved words change anywhere
 * (SAVED_CHANGED). `reload` reads it at once, for a page that changed a word itself without telling the others.
 */
export function useStorage() {
  const api = useDictionary();
  const [storage, setStorage] = useState<MyStorage>();
  const seq = useRef(0);
  const reload = useCallback(() => {
    const mine = ++seq.current;
    api
      .getMyStorage()
      .then((r) => {
        if (mine === seq.current) setStorage(r);
      })
      .catch(() => undefined); // the pages work without the figures: the service still enforces the limits
  }, [api]);
  useEffect(reload, [reload]);
  useEffect(() => {
    window.addEventListener(SAVED_CHANGED, reload);
    return () => window.removeEventListener(SAVED_CHANGED, reload);
  }, [reload]);
  return { storage, reload };
}

/** The storage is nearly full: 90 % or more of the limit. */
export function nearlyFull(u: { used: number; limit: number }): boolean {
  return u.limit > 0 && u.used >= u.limit * 0.9;
}
