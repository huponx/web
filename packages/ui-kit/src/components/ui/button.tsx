import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { useBusySpinner } from "../../hooks/useBusySpinner";
import { cn } from "../../lib/cn";
import { Tip } from "../tip";

export const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,opacity,filter,transform] duration-200 ease-out motion-reduce:transition-none active:scale-[0.97] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:[&:not([aria-busy])]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // glass: a gradient pill with a coloured glow; mono: flat and square-cornered (the radius token is small)
        default:
          "bg-primary text-primary-foreground shadow-(--shadow-btn) hover:bg-primary/90 active:bg-primary/75 glass:rounded-full glass:bg-(image:--btn-bg) glass:text-white glass:hover:bg-(image:--btn-bg) glass:hover:brightness-110 glass:active:brightness-90",
        destructive: "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 active:bg-destructive/75 glass:rounded-full",
        outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground active:bg-accent active:text-accent-foreground glass:rounded-full glass:bg-card",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 active:bg-secondary/60 glass:rounded-full",
        ghost: "hover:bg-accent hover:text-accent-foreground active:bg-accent active:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 gap-1.5 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-6",
        icon: "size-9 active:scale-90",
        "icon-sm": "size-8 active:scale-90",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner and disables the button while a call is running. */
  busy?: boolean;
}

/** forwardRef: a Button is often the trigger of a tooltip or a menu (`asChild`), which needs the element. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, busy, disabled, type = "button", title, children, ...props },
  ref,
) {
  // the spinner is delayed and kept a minimum time (no flicker on a fast call); the label stays in place, only hidden,
  // so the button never changes size
  const spinner = useBusySpinner(busy);
  if (asChild) {
    return (
      <Slot ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props}>
        {children}
      </Slot>
    );
  }
  // a title shows as the tooltip of the kit, not the one of the browser
  return (
    <Tip label={title} wrap={Boolean(disabled || busy)}>
    <button
      {...props}
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {spinner ? <Loader2 className="absolute animate-spin" aria-hidden="true" /> : null}
      <span className={cn("inline-flex items-center justify-center gap-[inherit]", spinner && "invisible")}>{children}</span>
    </button>
    </Tip>
  );
});
