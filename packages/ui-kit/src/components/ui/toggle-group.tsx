import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { forwardRef } from "react";
import type { ComponentProps, ElementRef } from "react";
import { cn } from "../../lib/cn";

export function ToggleGroup({ className, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return <ToggleGroupPrimitive.Root className={cn("inline-flex items-center rounded-md border bg-popover p-0.5 shadow-xs", className)} {...props} />;
}

/** forwardRef: it is the trigger of a Tooltip (`asChild`), which needs the element. */
export const ToggleGroupItem = forwardRef<ElementRef<typeof ToggleGroupPrimitive.Item>, ComponentProps<typeof ToggleGroupPrimitive.Item>>(
  function ToggleGroupItem({ className, ...props }, ref) {
    return (
      <ToggleGroupPrimitive.Item
        ref={ref}
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:size-4",
          className,
        )}
        {...props}
      />
    );
  },
);
