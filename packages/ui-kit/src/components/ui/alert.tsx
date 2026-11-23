import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { AlertCircle, CheckCircle2, TriangleAlert } from "lucide-react";
import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

const alertVariants = cva("relative flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-sm", {
  variants: {
    variant: {
      default: "bg-card text-card-foreground",
      success: "border-success/40 bg-success/10 text-foreground [&>svg]:text-success",
      warning: "border-warning/40 bg-warning/10 text-foreground [&>svg]:text-warning",
      destructive: "border-destructive/40 bg-destructive/10 text-foreground [&>svg]:text-destructive",
    },
  },
  defaultVariants: { variant: "default" },
});

const icons = { default: null, success: CheckCircle2, warning: TriangleAlert, destructive: AlertCircle } as const;

export function Alert({ className, variant = "default", children, ...props }: HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) {
  const Icon = icons[variant ?? "default"];
  return (
    <div role={variant === "destructive" ? "alert" : "status"} className={cn(alertVariants({ variant }), className)} {...props}>
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
