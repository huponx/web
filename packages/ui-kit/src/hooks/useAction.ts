import { useCallback, useState } from "react";

/** Runs an action and tracks busy, error and a success message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [done, setDone] = useState<string>();
  // counts the successes: a second save with the same message restarts the notice instead of replacing it
  const [doneId, setDoneId] = useState(0);
  const run = useCallback(async <T,>(fn: () => Promise<T>, message?: string): Promise<T | undefined> => {
    setBusy(true);
    // the previous notice and error stay on screen while the call runs, and are replaced by the result: clearing
    // them first made them vanish and come back on every save
    try {
      const r = await fn();
      setError(undefined);
      setDone(message);
      if (message) setDoneId((n) => n + 1);
      return r;
    } catch (err) {
      setDone(undefined);
      setError(err);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, done, doneId, run, clear: () => (setError(undefined), setDone(undefined)) };
}
