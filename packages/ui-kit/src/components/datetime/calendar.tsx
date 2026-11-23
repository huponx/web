import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "../../lib/cn";
import { useUiMessages } from "../messages";
import { addDays, parseDate, sameDay, toDateStr, today } from "./date-utils";

export interface CalendarProps {
  /** Selected day, "YYYY-MM-DD" ("" for none). */
  value: string;
  onSelect: (value: string) => void;
  /** First and last day that can be picked ("YYYY-MM-DD"). */
  min?: string;
  max?: string;
  /** 1 (Monday, default) or 0 (Sunday). */
  weekStartsOn?: 0 | 1;
  locale?: string;
  /** `lg`: bigger cells for a finger. */
  size?: "md" | "lg";
  className?: string;
}

/** A month grid. Arrow keys move by a day or a week, PageUp/PageDown by a month. */
export function Calendar({ value, onSelect, min, max, weekStartsOn = 1, locale, size = "md", className }: CalendarProps) {
  const m = useUiMessages().pickers;
  const selected = parseDate(value);
  const lo = parseDate(min);
  const hi = parseDate(max);
  const now = today();
  const [focus, setFocus] = useState<Date>(selected ?? now);
  const grid = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(focus);
  const weekdays = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { weekday: "short" });
    // 2024-01-01 is a Monday, so day 0 is a Sunday
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, i + weekStartsOn)));
  }, [locale, weekStartsOn]);

  const first = new Date(focus.getFullYear(), focus.getMonth(), 1);
  const lead = (first.getDay() - weekStartsOn + 7) % 7;
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i - lead));
  const disabled = (d: Date) => (lo !== null && d < lo) || (hi !== null && d > hi);

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${toDateStr(focus)}"]`)?.focus();
  }, [focus]);

  function go(d: Date) {
    moved.current = true;
    setFocus(d);
  }
  function key(e: KeyboardEvent) {
    const step: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => new Date(focus.getFullYear(), focus.getMonth() - 1, focus.getDate()),
      PageDown: () => new Date(focus.getFullYear(), focus.getMonth() + 1, focus.getDate()),
      Home: () => addDays(focus, -((focus.getDay() - weekStartsOn + 7) % 7)),
      End: () => addDays(focus, 6 - ((focus.getDay() - weekStartsOn + 7) % 7)),
    };
    const next = step[e.key];
    if (!next) return;
    e.preventDefault();
    go(next());
  }
  const shift = (n: number) => setFocus(new Date(focus.getFullYear(), focus.getMonth() + n, 1));
  const navBtn =
    "inline-grid size-8 place-items-center rounded-md text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 glass:rounded-full [&_svg]:size-4";

  return (
    <div className={cn("w-full min-w-0", className)}>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className={navBtn} aria-label={m.previousMonth} onClick={() => shift(-1)}>
          <ChevronLeft aria-hidden="true" />
        </button>
        <span className="text-sm font-semibold capitalize" aria-live="polite">
          {monthLabel}
        </span>
        <button type="button" className={navBtn} aria-label={m.nextMonth} onClick={() => shift(1)}>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5" aria-hidden="true">
        {weekdays.map((w, i) => (
          <span key={i} className="py-1 text-center text-[11px] tracking-wide text-muted-foreground uppercase">
            {w}
          </span>
        ))}
      </div>
      <div ref={grid} role="grid" aria-label={monthLabel} className="grid grid-cols-7 gap-0.5" onKeyDown={key}>
        {days.map((d) => {
          const isSel = selected !== null && sameDay(d, selected);
          const out = d.getMonth() !== focus.getMonth();
          return (
            <button
              key={toDateStr(d)}
              type="button"
              data-date={toDateStr(d)}
              tabIndex={sameDay(d, focus) ? 0 : -1}
              disabled={disabled(d)}
              aria-pressed={isSel}
              aria-current={sameDay(d, now) ? "date" : undefined}
              aria-label={d.toLocaleDateString(locale, { dateStyle: "full" })}
              onClick={() => onSelect(toDateStr(d))}
              className={cn(
                "grid aspect-square place-items-center rounded-md text-sm tabular-nums outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-30 glass:rounded-full",
                size === "lg" ? "min-h-11 text-base" : "min-h-8",
                out && !isSel && "text-muted-foreground/60",
                sameDay(d, now) && !isSel && "ring-1 ring-primary",
                isSel &&
                  "bg-primary font-semibold text-primary-foreground hover:bg-primary hover:text-primary-foreground glass:bg-(image:--btn-bg) glass:shadow-(--shadow-btn)",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
