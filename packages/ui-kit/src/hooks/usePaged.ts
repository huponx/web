import { useEffect, useState } from "react";
import { useAction } from "./useAction";
import { useLoad } from "./useLoad";

/** One page of a list: the items and the token of the next page ("" on the last one). */
export interface Page<T> {
  items: T[];
  next: string;
}

/**
 * A list read page by page with page tokens: the first page reloads with `deps` (the search), loadMore appends the
 * next one. `next` is empty when everything is loaded.
 */
export function usePaged<T>(load: (token: string) => Promise<Page<T>>, deps: readonly unknown[]) {
  const first = useLoad(() => load(""), deps);
  const [more, setMore] = useState<T[]>([]);
  // the token of the page after the last loaded one; undefined while only the first page is loaded
  const [token, setToken] = useState<string>();
  const action = useAction();
  useEffect(() => {
    setMore([]);
    setToken(undefined);
  }, [first.data]);
  const next = token ?? first.data?.next ?? "";
  const items = first.data ? [...first.data.items, ...more] : undefined;
  async function loadMore() {
    const r = await action.run(() => load(next));
    if (r) {
      setMore((m) => [...m, ...r.items]);
      setToken(r.next);
    }
  }
  return { items, loading: first.loading, error: first.error, reload: first.reload, next, loadMore, moreBusy: action.busy, moreError: action.error };
}
