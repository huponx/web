import { cn } from "../lib/cn";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export interface DropdownOption {
  value: string;
  label: string;
}

// Radix does not allow an item with an empty value: it stands for the "nothing chosen" entry
const EMPTY = "__empty__";

export interface DropdownProps {
  /** Accessible name of the trigger. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  id?: string;
  /** Shown while `value` matches no option (an option with the value "" counts as a match). */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** A list to pick one entry from (the kit's Select with a flat options prop). The value "" is allowed. */
export function Dropdown({ label, value, onChange, options, id, placeholder, disabled, className }: DropdownProps) {
  const known = options.some((o) => o.value === value);
  return (
    <Select value={known ? (value === "" ? EMPTY : value) : ""} onValueChange={(v) => onChange(v === EMPTY ? "" : v)} disabled={disabled}>
      <SelectTrigger id={id} aria-label={label} className={cn("w-auto min-w-40", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="w-auto min-w-[var(--radix-select-trigger-width)] max-w-[min(24rem,var(--radix-select-content-available-width))]">
        {options.map((o) => (
          <SelectItem key={o.value} className="whitespace-nowrap" value={o.value === "" ? EMPTY : o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
