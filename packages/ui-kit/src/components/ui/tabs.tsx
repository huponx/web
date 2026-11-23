import * as TabsPrimitive from "@radix-ui/react-tabs";
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ComponentProps, ElementRef } from "react";
import { cn } from "../../lib/cn";

export function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn("flex flex-col gap-4", className)} {...props} />;
}

/**
 * The row of tabs. The highlight of the active tab is one element that slides to the tab that became
 * active (measured from the trigger, so tabs of any width work).
 */
export const TabsList = forwardRef<ElementRef<typeof TabsPrimitive.List>, ComponentProps<typeof TabsPrimitive.List>>(function TabsList(
  { className, children, ...props },
  ref,
) {
  const list = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  const measure = useCallback(() => {
    const active = list.current?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    if (!active || active.offsetWidth === 0) return setBox(null);
    setBox((b) => (b && b.left === active.offsetLeft && b.width === active.offsetWidth ? b : { left: active.offsetLeft, width: active.offsetWidth }));
  }, []);

  useLayoutEffect(measure);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    // the active tab changes (data-state), the labels change size (language, font loading, window)
    const mutations = new MutationObserver(measure);
    mutations.observe(el, { attributes: true, subtree: true, attributeFilter: ["data-state"] });
    const sizes = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    sizes?.observe(el);
    return () => {
      mutations.disconnect();
      sizes?.disconnect();
    };
  }, [measure]);

  return (
    <TabsPrimitive.List
      ref={(node) => {
        list.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      className={cn("relative inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground glass:rounded-full mono:gap-4 mono:rounded-none mono:border-b mono:bg-transparent mono:p-0", className)}
      {...props}
    >
      {box ? (
        <span
          aria-hidden="true"
          data-testid="tabs-indicator"
          style={{ width: box.width, transform: `translateX(${box.left}px)` }}
          className="absolute top-1 bottom-1 left-0 rounded-md bg-background shadow-xs glass:rounded-full glass:bg-card mono:top-auto mono:bottom-0 mono:h-0.5 mono:rounded-none mono:bg-foreground mono:shadow-none transition-[transform,width] duration-300 ease-out motion-reduce:transition-none"
        />
      ) : null}
      {children}
    </TabsPrimitive.List>
  );
});

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        // no focus ring: the sliding highlight already shows the active tab (arrow keys activate the tab they reach)
        "relative z-10 inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium whitespace-nowrap outline-none transition-colors duration-300 hover:text-foreground focus:outline-none focus-visible:outline-none data-[state=active]:text-foreground glass:rounded-full mono:rounded-none mono:px-0",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("flex flex-col gap-4 outline-none", className)} {...props} />;
}
