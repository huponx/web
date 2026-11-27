import { Check } from "lucide-react";

export interface StepperProps {
  /** The names of the steps, in order. */
  steps: string[];
  /** The step in progress, from 1; the ones before it are done. */
  current: number;
  /** The accessible name of the list. */
  label: string;
}

/** The progress of a wizard: a numbered circle over the name of each step, joined by a line that fills as steps are done. */
export function Stepper({ steps, current, label }: StepperProps) {
  return (
    <ol className="flex items-start" aria-label={label}>
      {steps.map((name, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={name} className="relative flex flex-1 flex-col items-center gap-2 text-center text-sm" aria-current={active ? "step" : undefined}>
            {n < steps.length ? (
              <span
                className={`absolute left-[calc(50%+1.5rem)] right-[calc(-50%+1.5rem)] top-4 h-0.5 -translate-y-1/2 rounded-full ${done ? "bg-primary" : "bg-muted-foreground/30"}`}
                aria-hidden="true"
              />
            ) : null}
            <span
              className={`relative flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors ${
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : active
                    ? "border-primary bg-background text-primary ring-4 ring-primary/20"
                    : "border-muted-foreground/40 bg-background text-muted-foreground"
              }`}
            >
              {done ? <Check className="size-4" aria-hidden="true" /> : n}
            </span>
            <span className={active ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted-foreground"}>{name}</span>
          </li>
        );
      })}
    </ol>
  );
}
