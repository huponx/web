import type { FocusEvent, ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

// How the user last used the page: a tooltip opens on focus only for the keyboard. A dialog that opens after a click
// focuses its first button, and a tooltip open there would take the first Escape away from the dialog.
let keyboard = false;
if (typeof document !== "undefined") {
  document.addEventListener("keydown", () => (keyboard = true), true);
  document.addEventListener("pointerdown", () => (keyboard = false), true);
}

function onlyKeyboardFocus(e: FocusEvent<HTMLElement>) {
  if (!keyboard) e.preventDefault();
}

/**
 * The tooltip of the kit around one element, in place of the native `title` (which looks different in every
 * browser, is slow and does not show on touch). Nothing is added when `label` is empty. It has its own provider, so the
 * page needs none. A disabled element gets no pointer events, so `wrap` puts the tooltip on a span around it.
 */
export function Tip({ label, children, wrap = false }: { label?: ReactNode; children: ReactElement; wrap?: boolean }) {
  if (label === undefined || label === null || label === false || label === "") return children;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild onFocus={onlyKeyboardFocus}>{wrap ? <span className="inline-flex">{children}</span> : children}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
