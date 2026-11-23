import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight } from "lucide-react";
import type { ComponentProps, HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;
export const DropdownMenuSub = MenuPrimitive.Sub;
export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

const surface =
  "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95";

const item =
  "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content sideOffset={sideOffset} className={cn(surface, className)} {...props} />
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, inset, ...props }: ComponentProps<typeof MenuPrimitive.Item> & { inset?: boolean }) {
  return <MenuPrimitive.Item className={cn(item, inset && "pl-8", className)} {...props} />;
}

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof MenuPrimitive.RadioItem>) {
  return (
    <MenuPrimitive.RadioItem className={cn(item, "pr-2 pl-8", className)} {...props}>
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <MenuPrimitive.ItemIndicator>
          <Check className="size-4" aria-hidden="true" />
        </MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof MenuPrimitive.Label>) {
  return <MenuPrimitive.Label className={cn("px-2 py-1.5 text-sm font-medium", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

export function DropdownMenuShortcut({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("ml-auto text-xs tracking-widest text-muted-foreground", className)} {...props} />;
}

export function DropdownMenuSubTrigger({ className, children, ...props }: ComponentProps<typeof MenuPrimitive.SubTrigger>) {
  return (
    <MenuPrimitive.SubTrigger className={cn(item, "data-[state=open]:bg-accent", className)} {...props}>
      {children}
      <ChevronRight className="ml-auto" aria-hidden="true" />
    </MenuPrimitive.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, ...props }: ComponentProps<typeof MenuPrimitive.SubContent>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.SubContent className={cn(surface, className)} {...props} />
    </MenuPrimitive.Portal>
  );
}
