import { useCallback, useEffect, useState } from "react";

/** Loads data on mount and whenever `reload` is called. */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fn = useCallback(load, deps);
  useEffect(() => {
    let live = true;
    // an error from the last try stays on screen until this one ends
    fn().then(
      (d) => {
        if (!live) return;
        setError(undefined);
        setData(d);
      },
      (err) => live && setError(err),
    );
    return () => {
      live = false;
    };
  }, [fn, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading: data === undefined && error === undefined, reload };
}
