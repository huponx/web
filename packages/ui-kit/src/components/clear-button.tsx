import { X } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";
import { Tip } from "./tip";

/**
 * The X that empties a text field. Put it in a `relative` wrapper around the field; the field needs
 * right padding (`pr-9`). `label` is the accessible name (e.g. "Clear search").
 */
export function ClearButton({ label, className, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & { label: string }) {
  return (
    <Tip label={label}>
    <button
      type="button"
      aria-label={label}
      className={cn(
        "absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      <X className="size-4" aria-hidden="true" />
    </button>
    </Tip>
  );
}
