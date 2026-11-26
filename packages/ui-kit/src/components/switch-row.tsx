import { useId } from "react";
import type { ReactNode } from "react";
import { Switch } from "./ui/switch";

export interface SwitchRowProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** Shown under the hint (a badge saying why the switch is locked, for example). */
  extra?: ReactNode;
}

/** A setting that is on or off: the name and what it does on the left, the switch on the right. */
export function SwitchRow({ label, hint, checked, onChange, disabled, extra }: SwitchRowProps) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col">
        <span id={id} className="text-sm font-medium">
          {label}
        </span>
        {hint ? <span className="text-sm text-muted-foreground">{hint}</span> : null}
        {extra}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-labelledby={id} disabled={disabled} />
    </div>
  );
}
