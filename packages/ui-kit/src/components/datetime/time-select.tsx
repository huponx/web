import { useEffect, useRef } from "react";
import { cn } from "../../lib/cn";
import { useUiMessages } from "../messages";
import { pad } from "./date-utils";
import type { Clock } from "./date-utils";

export interface TimeSelectProps {
  value: Clock;
  onChange: (value: Clock) => void;
  /** Minutes between two choices (default 5). */
  minuteStep?: number;
}

const range = (n: number, step: number) => Array.from({ length: Math.ceil(n / step) }, (_, i) => i * step);

function Column({ label, items, current, set }: { label: string; items: number[]; current: number; set: (n: number) => void }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && list.current) list.current.scrollTop = el.offsetTop - list.current.clientHeight / 2 + el.clientHeight / 2;
    // only when the picker opens: a click must not move the list under the pointer
  }, []);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-center text-[11px] tracking-wide text-muted-foreground uppercase">{label}</span>
      <div ref={list} role="listbox" aria-label={label} className="flex h-56 w-16 flex-col gap-0.5 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
        {items.map((n) => (
          <button
            key={n}
            type="button"
            role="option"
            aria-selected={n === current}
            onClick={() => set(n)}
            className={cn(
              "h-8 shrink-0 rounded-md text-sm tabular-nums outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 glass:rounded-full",
              n === current && "bg-primary font-semibold text-primary-foreground hover:bg-primary hover:text-primary-foreground glass:bg-(image:--btn-bg) glass:shadow-(--shadow-btn)",
            )}
          >
            {pad(n)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Hour and minute as two scroll lists, for a pointer and a keyboard (desktop). */
export function TimeColumns({ value, onChange, minuteStep = 5 }: TimeSelectProps) {
  const m = useUiMessages().pickers;
  return (
    <div className="flex gap-1.5">
      <Column label={m.hour} items={range(24, 1)} current={value.h} set={(h) => onChange({ ...value, h })} />
      <Column label={m.minute} items={range(60, minuteStep)} current={value.m} set={(min) => onChange({ ...value, m: min })} />
    </div>
  );
}

const ROW = 44;

function Wheel({ label, items, current, set }: { label: string; items: number[]; current: number; set: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = Math.max(0, items.indexOf(current)) * ROW;
    return () => clearTimeout(timer.current);
    // only when the sheet opens: scrolling the wheel itself changes `current`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      onScroll={(e) => {
        const top = e.currentTarget.scrollTop;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          const v = items[Math.min(items.length - 1, Math.max(0, Math.round(top / ROW)))];
          if (v !== undefined && v !== current) set(v);
        }, 90);
      }}
      className="h-56 w-24 snap-y snap-mandatory overflow-y-auto py-[88px] outline-none [-webkit-mask-image:linear-gradient(transparent,#000_32%,#000_68%,transparent)] [mask-image:linear-gradient(transparent,#000_32%,#000_68%,transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((n) => (
        <div key={n} role="option" aria-selected={n === current} className="grid h-11 snap-center place-items-center text-xl tabular-nums">
          {pad(n)}
        </div>
      ))}
    </div>
  );
}

/** Hour and minute as snap wheels, for a finger (mobile). */
export function TimeWheels({ value, onChange, minuteStep = 5 }: TimeSelectProps) {
  const m = useUiMessages().pickers;
  return (
    <div className="relative flex justify-center gap-2 px-2">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-3 top-1/2 h-11 -translate-y-1/2 rounded-md bg-accent glass:rounded-full" />
      <Wheel label={m.hour} items={range(24, 1)} current={value.h} set={(h) => onChange({ ...value, h })} />
      <span aria-hidden="true" className="relative self-center text-2xl font-semibold">
        :
      </span>
      <Wheel label={m.minute} items={range(60, minuteStep)} current={value.m} set={(min) => onChange({ ...value, m: min })} />
    </div>
  );
}
