import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "role" | "type"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** An on/off toggle (role="switch"). Name it with `aria-label` or `aria-labelledby`. */
export function Switch({ checked, onCheckedChange, className, disabled, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent p-0.5 shadow-xs outline-none transition-colors duration-200 ease-out motion-reduce:transition-none",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          // a soft spring on the compositor only (transform): no layout or paint per frame
          "pointer-events-none block size-4 rounded-full bg-popover shadow will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.34,1.45,0.64,1)] motion-reduce:transition-none",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}
