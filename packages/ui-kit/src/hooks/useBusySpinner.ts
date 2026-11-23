import { useEffect, useRef, useState } from "react";

/**
 * Whether to show a spinner for a busy flag, without the flicker of a fast call: the spinner appears only when the
 * work lasts longer than `delay`, and once shown it stays for at least `minShow`, so it never blinks in and out.
 */
export function useBusySpinner(busy: boolean | undefined, delay = 150, minShow = 400): boolean {
  const [show, setShow] = useState(false);
  const since = useRef(0);

  useEffect(() => {
    if (busy) {
      const id = setTimeout(() => {
        since.current = Date.now();
        setShow(true);
      }, delay);
      return () => clearTimeout(id);
    }
    if (!show) return;
    const id = setTimeout(() => setShow(false), Math.max(0, minShow - (Date.now() - since.current)));
    return () => clearTimeout(id);
  }, [busy, delay, minShow, show]);

  return show;
}
