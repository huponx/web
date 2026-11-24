import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { Check, CircleAlert, TriangleAlert, X } from "lucide-react";
import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

/**
 * The notice of a page. Each style has its own look, driven by `--c` (the colour of the variant):
 * saas: an inverted toast (dark on a light page, light on a dark one) with a coloured dot;
 * glass: a frosted bar with the icon in a tinted bubble; mono: flat, with a bar on the left.
 */
const alertVariants = cva(
  [
    "ui-glass relative flex w-full items-center gap-3 rounded-xl border border-foreground/10 bg-foreground px-4 py-3 text-sm text-background shadow-lg",
    "duration-300 animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none",
    "glass:rounded-2xl glass:border-border glass:bg-card glass:text-foreground glass:shadow-(--shadow-card)",
    "mono:rounded-none mono:border-l-4 mono:border-y-border mono:border-r-border mono:border-l-(--c) mono:bg-transparent mono:text-foreground mono:shadow-none",
  ],
  {
    variants: {
      variant: {
        default: "[--c:var(--primary)]",
        success: "[--c:var(--success)]",
        warning: "[--c:var(--warning)]",
        destructive: "[--c:var(--destructive)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const icons = { default: null, success: Check, warning: TriangleAlert, destructive: CircleAlert } as const;

export interface AlertProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  /** A follow-up the notice offers ("Undo", "Retry"). */
  action?: { label: string; onClick: () => void };
  /** Shows a close button; `closeLabel` is its accessible name. */
  onClose?: () => void;
  closeLabel?: string;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { className, variant = "default", children, action, onClose, closeLabel = "Close", ...props },
  ref,
) {
  const Icon = icons[variant ?? "default"];
  return (
    <div ref={ref} role={variant === "destructive" ? "alert" : "status"} className={cn(alertVariants({ variant }), className)} {...props}>
      {Icon ? (
        <span
          aria-hidden="true"
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-full bg-(--c) text-background [&>svg]:size-3",
            "glass:size-8 glass:bg-[color-mix(in_srgb,var(--c)_18%,transparent)] glass:text-(--c) glass:[&>svg]:size-4",
            "mono:size-4 mono:bg-transparent mono:text-(--c) mono:[&>svg]:size-4",
          )}
        >
          <Icon strokeWidth={3} />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">{children}</div>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 rounded-md px-2 py-1 text-sm font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {action.label}
        </button>
      ) : null}
      {onClose ? (
        <button
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          className="-m-1 shrink-0 rounded-md p-2 opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4"
        >
          <X aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
});
