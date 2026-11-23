import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

/** A scrollable region styled like the rest of the kit (native scrolling, no extra runtime styles). */
export function ScrollArea({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("overflow-y-auto overflow-x-hidden [scrollbar-width:thin]", className)} {...props} />;
}
