import { useEffect, useId, useRef, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export type ProgressTone = "primary" | "success" | "warning" | "destructive";

export interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Current value, 0 to `max`. Without it the progress is indeterminate (work of unknown length). */
  value?: number;
  max?: number;
  /** A bar (default) or a ring. */
  shape?: "linear" | "circle";
  tone?: ProgressTone;
  /** Ring: diameter in px (default 64). */
  size?: number;
  /** Ring: width of the stroke in px (default 6). Bar: use `className` for the height. */
  strokeWidth?: number;
  /** Ring: shows the percentage in the middle, counted up smoothly. */
  showValue?: boolean;
  /** Ring: what to put in the middle instead of the percentage. */
  children?: ReactNode;
}

const toneText: Record<ProgressTone, string> = { primary: "text-primary", success: "text-success", warning: "text-warning", destructive: "text-destructive" };
const toneBg: Record<ProgressTone, string> = { primary: "bg-primary glass:bg-(image:--btn-bg)", success: "bg-success", warning: "bg-warning", destructive: "bg-destructive" };

function reduced(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A value that eases to its target (for the number in the ring), so the digits move with the stroke. */
function useTween(target: number, ms = 500): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduced() || typeof requestAnimationFrame !== "function") {
      setV(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = a + (target - a) * eased;
      from.current = next;
      setV(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** The fraction (0 to 1) a bar or ring shows. It starts at 0 and moves on the next frame, so the first fill animates too. */
function useFraction(value: number | undefined, max: number): number | undefined {
  const target = value === undefined ? undefined : Math.min(1, Math.max(0, value / (max || 1)));
  const [shown, setShown] = useState<number | undefined>(target === undefined ? undefined : 0);
  useEffect(() => {
    if (target === undefined) return setShown(undefined);
    const id = typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => setShown(target)) : 0;
    if (!id) setShown(target);
    return () => (id ? cancelAnimationFrame(id) : undefined);
  }, [target]);
  return target === undefined ? undefined : shown;
}

/**
 * A progress bar or ring. The fill moves with a transition (transform and stroke offset only, so it stays smooth),
 * the first value animates in from empty, and without a `value` it loops (indeterminate). Name it with
 * `aria-label` or `aria-labelledby`.
 */
export function Progress({ value, max = 100, shape = "linear", tone = "primary", size = 64, strokeWidth = 6, showValue, className, children, ...props }: ProgressProps) {
  const fraction = useFraction(value, max);
  const indeterminate = value === undefined;
  const percent = indeterminate ? 0 : Math.round(Math.min(1, Math.max(0, value / (max || 1))) * 100);
  const counted = Math.round(useTween(percent));
  const gradient = useId();
  const aria = {
    role: "progressbar" as const,
    "aria-valuemin": 0,
    "aria-valuemax": max,
    "aria-valuenow": indeterminate ? undefined : Math.min(max, Math.max(0, value)),
    "aria-valuetext": indeterminate ? undefined : `${percent}%`,
  };

  if (shape === "circle") {
    const r = (size - strokeWidth) / 2;
    const c = 2 * Math.PI * r;
    return (
      <div {...aria} data-shape="circle" className={cn("relative inline-grid shrink-0 place-items-center", toneText[tone], className)} style={{ width: size, height: size }} {...props}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          aria-hidden="true"
          className={cn("-rotate-90", indeterminate && "origin-center motion-safe:animate-[progress-spin_1.1s_linear_infinite]")}
        >
          {tone === "primary" ? (
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" style={{ stopColor: "var(--grad-from)" }} />
                <stop offset="1" style={{ stopColor: "var(--grad-to)" }} />
              </linearGradient>
            </defs>
          ) : null}
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={strokeWidth} className="stroke-muted" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap={`round`}
            stroke={tone === "primary" ? `url(#${gradient})` : "currentColor"}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - (indeterminate ? 0.25 : (fraction ?? 0)))}
            className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none mono:[stroke-linecap:butt]"
          />
        </svg>
        {children ?? (showValue && !indeterminate ? <span className="absolute text-sm font-semibold text-foreground tabular-nums">{counted}%</span> : null)}
      </div>
    );
  }

  return (
    <div
      {...aria}
      data-shape="linear"
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted mono:rounded-none", className)}
      {...props}
    >
      <div
        className={cn(
          "h-full w-full origin-left rounded-[inherit] will-change-transform",
          toneBg[tone],
          indeterminate
            ? "w-2/5 motion-safe:animate-[progress-slide_1.4s_ease-in-out_infinite]"
            : "transition-transform duration-500 ease-out motion-reduce:transition-none",
        )}
        style={indeterminate ? undefined : { transform: `scaleX(${fraction ?? 0})` }}
      />
    </div>
  );
}
