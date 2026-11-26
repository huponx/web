import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

/** Where the popover opens relative to the field (desktop). It flips by itself when there is no room. */
export type PickerSide = "top" | "bottom" | "left" | "right";
/** How the popover lines up with that side: at the start, the center or the end of the field. */
export type PickerAlign = "start" | "center" | "end";
/** `auto`: a popover from `md` up, a bottom sheet on a phone. */
export type PickerVariant = "auto" | "popover" | "sheet";

export interface PickerPlacement {
  /** Side of the field the popover opens on (default `bottom`). Not used by the sheet. */
  side?: PickerSide;
  /** Alignment along that side (default `start`). Not used by the sheet. */
  align?: PickerAlign;
  /** Gap to the field in px (default 6). */
  sideOffset?: number;
  /** Shift along the side in px. */
  alignOffset?: number;
  variant?: PickerVariant;
}

const PHONE = "(max-width: 767px)";

function subscribe(cb: () => void) {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const mq = window.matchMedia(PHONE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** `popover` or `sheet` for a `variant` (`auto` follows the width of the screen). */
export function usePickerMode(variant: PickerVariant = "auto"): "popover" | "sheet" {
  const phone = useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === "function" && window.matchMedia(PHONE).matches,
    () => false,
  );
  return variant === "auto" ? (phone ? "sheet" : "popover") : variant;
}

export interface PickerSurfaceProps extends PickerPlacement {
  mode: "popover" | "sheet";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The field the picker opens from: a button. */
  trigger: ReactNode;
  /** Accessible name of the picker, and the title of the sheet. */
  title: string;
  /** Sheet only: the header buttons (Cancel, Done). */
  sheetHeader?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** The container of a picker: a popover next to the field, or a bottom sheet. */
export function PickerSurface({
  mode,
  open,
  onOpenChange,
  trigger,
  title,
  sheetHeader,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  alignOffset = 0,
  className,
  children,
}: PickerSurfaceProps) {
  if (mode === "sheet") {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            data-picker="sheet"
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 flex max-h-[92svh] flex-col gap-3 overflow-y-auto rounded-t-2xl border-t bg-popover p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-popover-foreground shadow-lg outline-none",
              "duration-300 data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom motion-reduce:animate-none",
              "mono:rounded-none mono:border-t-foreground",
              className,
            )}
          >
            <span aria-hidden="true" className="mx-auto -mt-1 h-1 w-10 rounded-full bg-border" />
            <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
            {sheetHeader ? <div className="flex items-center justify-between gap-2">{sheetHeader}</div> : null}
            {children}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
          collisionPadding={8}
          aria-label={title}
          data-picker="popover"
          className={cn(
            "ui-glass z-50 flex w-72 flex-col gap-3 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 motion-reduce:animate-none",
            "glass:rounded-2xl mono:rounded-none mono:shadow-none mono:border-foreground",
            className,
          )}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
