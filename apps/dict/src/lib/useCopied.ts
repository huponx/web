import { useCallback, useEffect, useRef, useState } from "react";

/** Which copy button just succeeded (its key), until `ms` later: the button shows a tick meanwhile. */
export function useCopied(
  ms = 1500,
): [string | undefined, (key: string) => void] {
  const [copied, setCopied] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const mark = useCallback(
    (key: string) => {
      clearTimeout(timer.current);
      setCopied(key);
      timer.current = setTimeout(() => setCopied(undefined), ms);
    },
    [ms],
  );
  return [copied, mark];
}
