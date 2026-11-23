import type { ComponentProps, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Alert } from "./ui/alert";

/** How long a notice stays by default. */
export const NOTICE_MS = 4000;

type AutoAlertProps = Omit<ComponentProps<typeof Alert>, "children"> & {
  children?: ReactNode;
  /** Hide after this many milliseconds. */
  duration?: number;
  /** A change of this value shows the alert again and restarts the timer (default: the children). */
  watch?: unknown;
};

/** An `Alert` that goes away by itself, for success messages. Renders nothing without children. */
export function AutoAlert({ children, duration = NOTICE_MS, watch, ...props }: AutoAlertProps) {
  const [hidden, setHidden] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const key = watch === undefined ? children : watch;
  useEffect(() => {
    setHidden(false);
    if (!children) return;
    const id = setTimeout(() => setHidden(true), duration);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, duration]);
  // it can be above the row that was acted on: bring it into view
  const shown = Boolean(children) && !hidden;
  useEffect(() => {
    if (shown) ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [shown, key]);
  if (!shown) return null;
  return (
    <Alert ref={ref} {...props}>
      {children}
    </Alert>
  );
}
