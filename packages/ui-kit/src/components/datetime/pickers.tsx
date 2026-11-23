import { CalendarDays, Clock as ClockIcon } from "lucide-react";
import { forwardRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { useUiMessages } from "../messages";
import { Button } from "../ui/button";
import { Calendar } from "./calendar";
import { addDays, formatDate, parseTime, roundTime, splitDateTime, toDateStr, toTimeStr, today } from "./date-utils";
import type { Clock } from "./date-utils";
import { PickerSurface, usePickerMode } from "./picker-surface";
import type { PickerPlacement } from "./picker-surface";
import { TimeColumns, TimeWheels } from "./time-select";

interface PickerBase extends PickerPlacement {
  /** Controlled value; "" for none. The format is the one of the matching <input type>. */
  value: string;
  /** Called with the new value, or "" when it is cleared. */
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Shows a Clear button (default true). */
  clearable?: boolean;
  /** Language of month and day names and of the text in the field (default: the one of the browser). */
  locale?: string;
  className?: string;
  id?: string;
  name?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-invalid"?: boolean;
}

const triggerClass =
  "ui-glass flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-base shadow-xs outline-none transition-colors md:text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=open]:border-ring data-[state=open]:ring-[3px] data-[state=open]:ring-ring/50 glass:bg-card";

/** The field a picker opens from. Radix puts the open state, the click and the ARIA on it. */
const Field = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { text: string; placeholder: string; icon: ReactNode }>(function Field(
  { text, placeholder, icon, className, ...props },
  ref,
) {
  return (
    <button ref={ref} type="button" aria-haspopup="dialog" className={cn(triggerClass, className)} {...props}>
      <span className={cn("min-w-0 flex-1 truncate", !text && "text-muted-foreground")} data-testid="picker-value">
        {text || placeholder}
      </span>
      <span className="shrink-0 text-muted-foreground [&_svg]:size-4" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
});

function fieldProps(p: PickerBase) {
  return {
    id: p.id,
    disabled: p.disabled,
    className: p.className,
    "aria-label": p["aria-label"],
    "aria-labelledby": p["aria-labelledby"],
    "aria-invalid": p["aria-invalid"],
  };
}

const placement = (p: PickerBase) => ({ side: p.side, align: p.align, sideOffset: p.sideOffset, alignOffset: p.alignOffset, variant: p.variant });

/** A hidden input, so the value goes with a plain <form> too. */
const Hidden = ({ name, value }: { name?: string; value: string }) => (name ? <input type="hidden" name={name} value={value} /> : null);

const ghost = "text-muted-foreground";

// ---------------------------------------------------------------------------------------------------------------

export interface DatePickerProps extends PickerBase {
  /** First and last day that can be picked, "YYYY-MM-DD". */
  min?: string;
  max?: string;
  weekStartsOn?: 0 | 1;
}

/** Picks a day: value is "YYYY-MM-DD". A popover next to the field on desktop, a bottom sheet on a phone. */
export function DatePicker(props: DatePickerProps) {
  const { value, onChange, min, max, weekStartsOn, locale, clearable = true, placeholder } = props;
  const m = useUiMessages().pickers;
  const mode = usePickerMode(props.variant);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const set = (next: boolean) => {
    if (next) setDraft(value);
    setOpen(next);
  };
  const pick = (d: string) => {
    onChange(d);
    setOpen(false);
  };
  const inRange = (d: Date) => (!min || toDateStr(d) >= min) && (!max || toDateStr(d) <= max);
  const todayD = today();
  const tomorrow = addDays(todayD, 1);
  return (
    <>
      <PickerSurface
        {...placement(props)}
        mode={mode}
        open={open}
        onOpenChange={set}
        title={m.selectDate}
        trigger={<Field {...fieldProps(props)} text={formatDate(value, locale)} placeholder={placeholder ?? m.select} icon={<CalendarDays />} />}
        sheetHeader={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {m.cancel}
            </Button>
            <Button size="sm" onClick={() => pick(draft)}>
              {m.done}
            </Button>
          </>
        }
      >
        {mode === "sheet" ? (
          <Calendar value={draft} onSelect={setDraft} min={min} max={max} weekStartsOn={weekStartsOn} locale={locale} size="lg" />
        ) : (
          <>
            <Calendar value={value} onSelect={pick} min={min} max={max} weekStartsOn={weekStartsOn} locale={locale} />
            {/* Today at the left edge, Tomorrow in the middle, Clear at the right edge */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center border-t pt-2">
              <Button variant="ghost" size="sm" className={cn(ghost, "justify-self-start")} disabled={!inRange(todayD)} onClick={() => pick(toDateStr(todayD))}>
                {m.today}
              </Button>
              <Button variant="ghost" size="sm" className={ghost} disabled={!inRange(tomorrow)} onClick={() => pick(toDateStr(tomorrow))}>
                {m.tomorrow}
              </Button>
              {clearable ? (
                <Button variant="ghost" size="sm" className={cn(ghost, "justify-self-end")} disabled={!value} onClick={() => pick("")}>
                  {m.clear}
                </Button>
              ) : (
                <span />
              )}
            </div>
          </>
        )}
      </PickerSurface>
      <Hidden name={props.name} value={value} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------

export interface TimePickerProps extends PickerBase {
  /** Minutes between two choices (default 5). */
  minuteStep?: number;
}

/** Picks a time of day: value is "HH:mm" (24 hour clock). */
export function TimePicker(props: TimePickerProps) {
  const { value, onChange, minuteStep = 5, clearable = true, placeholder } = props;
  const m = useUiMessages().pickers;
  const mode = usePickerMode(props.variant);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Clock>(parseTime(value) ?? roundTime(new Date(), minuteStep));
  const set = (next: boolean) => {
    if (next) setDraft(parseTime(value) ?? roundTime(new Date(), minuteStep));
    setOpen(next);
  };
  const apply = (t: Clock | null) => {
    onChange(t ? toTimeStr(t) : "");
    setOpen(false);
  };
  return (
    <>
      <PickerSurface
        {...placement(props)}
        mode={mode}
        open={open}
        onOpenChange={set}
        title={m.selectTime}
        className={mode === "popover" ? "w-auto" : undefined}
        trigger={<Field {...fieldProps(props)} text={value} placeholder={placeholder ?? m.select} icon={<ClockIcon />} />}
        sheetHeader={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {m.cancel}
            </Button>
            <Button size="sm" onClick={() => apply(draft)}>
              {m.done}
            </Button>
          </>
        }
      >
        {mode === "sheet" ? (
          <TimeWheels value={draft} onChange={setDraft} minuteStep={minuteStep} />
        ) : (
          <>
            <TimeColumns value={draft} onChange={setDraft} minuteStep={minuteStep} />
            <div className="flex items-center justify-between border-t pt-2">
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className={ghost} onClick={() => apply(roundTime(new Date(), minuteStep))}>
                  {m.now}
                </Button>
                {clearable ? (
                  <Button variant="ghost" size="sm" className={ghost} disabled={!value} onClick={() => apply(null)}>
                    {m.clear}
                  </Button>
                ) : null}
              </div>
              <Button size="sm" onClick={() => apply(draft)}>
                {m.apply}
              </Button>
            </div>
          </>
        )}
      </PickerSurface>
      <Hidden name={props.name} value={value} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------

export interface DateTimePickerProps extends PickerBase, Pick<DatePickerProps, "min" | "max" | "weekStartsOn">, Pick<TimePickerProps, "minuteStep"> {}

/** Picks a day and a time: value is "YYYY-MM-DDTHH:mm" (the value of <input type="datetime-local">). */
export function DateTimePicker(props: DateTimePickerProps) {
  const { value, onChange, min, max, weekStartsOn, locale, minuteStep = 5, clearable = true, placeholder } = props;
  const m = useUiMessages().pickers;
  const mode = usePickerMode(props.variant);
  const [open, setOpen] = useState(false);
  const initial = () => {
    const p = splitDateTime(value);
    return { date: p.date, time: parseTime(p.time) ?? { h: 9, m: 0 } };
  };
  const [draft, setDraft] = useState(initial);
  const [tab, setTab] = useState<"date" | "time">("date");
  const set = (next: boolean) => {
    if (next) {
      setDraft(initial());
      setTab("date");
    }
    setOpen(next);
  };
  const apply = () => {
    if (!draft.date) return;
    onChange(`${draft.date}T${toTimeStr(draft.time)}`);
    setOpen(false);
  };
  const shown = splitDateTime(value);
  const text = shown.date ? `${formatDate(shown.date, locale)}, ${shown.time}` : "";
  const summary = draft.date ? `${formatDate(draft.date, locale)}, ${toTimeStr(draft.time)}` : "";
  const calendar = (size: "md" | "lg") => (
    <Calendar value={draft.date} onSelect={(d) => setDraft((x) => ({ ...x, date: d }))} min={min} max={max} weekStartsOn={weekStartsOn} locale={locale} size={size} />
  );
  return (
    <>
      <PickerSurface
        {...placement(props)}
        mode={mode}
        open={open}
        onOpenChange={set}
        title={m.selectDateTime}
        className={mode === "popover" ? "w-[27rem] max-w-[calc(100vw-1rem)]" : undefined}
        trigger={<Field {...fieldProps(props)} text={text} placeholder={placeholder ?? m.select} icon={<CalendarDays />} />}
        sheetHeader={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {m.cancel}
            </Button>
            <Button size="sm" disabled={!draft.date} onClick={apply}>
              {m.done}
            </Button>
          </>
        }
      >
        {mode === "sheet" ? (
          <>
            <div role="tablist" className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 glass:rounded-full">
              {(["date", "time"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={cn(
                    "rounded-sm px-2 py-1.5 text-sm font-medium text-muted-foreground outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 glass:rounded-full",
                    tab === k && "bg-background text-foreground shadow-xs glass:bg-card",
                  )}
                >
                  {k === "date" ? `${m.date} · ${draft.date ? formatDate(draft.date, locale) : "—"}` : `${m.time} · ${toTimeStr(draft.time)}`}
                </button>
              ))}
            </div>
            {tab === "date" ? calendar("lg") : <TimeWheels value={draft.time} onChange={(t) => setDraft((x) => ({ ...x, time: t }))} minuteStep={minuteStep} />}
          </>
        ) : (
          <>
            <div className="flex gap-4">
              <div className="min-w-0 flex-1">{calendar("md")}</div>
              <TimeColumns value={draft.time} onChange={(t) => setDraft((x) => ({ ...x, time: t }))} minuteStep={minuteStep} />
            </div>
            <div className="flex items-center justify-between gap-2 border-t pt-2">
              <div className="flex min-w-0 items-center gap-1">
                {clearable ? (
                  <Button variant="ghost" size="sm" className={ghost} disabled={!value} onClick={() => (onChange(""), setOpen(false))}>
                    {m.clear}
                  </Button>
                ) : null}
                <span className="truncate text-xs text-muted-foreground" aria-live="polite">
                  {summary}
                </span>
              </div>
              <Button size="sm" disabled={!draft.date} onClick={apply}>
                {m.apply}
              </Button>
            </div>
          </>
        )}
      </PickerSurface>
      <Hidden name={props.name} value={value} />
    </>
  );
}
