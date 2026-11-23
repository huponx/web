import { useCallback, useState } from "react";

/** Runs an action and tracks busy, error and a success message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [done, setDone] = useState<string>();
  const run = useCallback(async <T,>(fn: () => Promise<T>, message?: string): Promise<T | undefined> => {
    setBusy(true);
    setError(undefined);
    setDone(undefined);
    try {
      const r = await fn();
      if (message) setDone(message);
      return r;
    } catch (err) {
      setError(err);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, done, run, clear: () => (setError(undefined), setDone(undefined)) };
}
