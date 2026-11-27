import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";

export interface SplitButtonAction {
  key: string;
  label: string;
  onSelect: () => void;
  icon?: LucideIcon;
  /** Red entry (reject, delete). */
  destructive?: boolean;
}

export interface SplitButtonProps {
  /** The first action is the default one: the button runs it, the other actions are in the menu. */
  actions: SplitButtonAction[];
  /** Accessible name of the menu trigger (the chevron). */
  menuLabel: string;
  /** Prefix of the `data-testid`s: `<testId>` (default action) and `<testId>-menu`. */
  testId?: string;
  size?: "default" | "sm";
  variant?: "default" | "outline" | "secondary";
  busy?: boolean;
  disabled?: boolean;
  className?: string;
}

/** A button with a default action and a chevron that opens the other actions (quick approve / reject, for example). */
export function SplitButton({ actions, menuLabel, testId, size = "sm", variant = "default", busy, disabled, className }: SplitButtonProps) {
  const [main, ...rest] = actions;
  if (!main) return null;
  const Icon = main.icon;
  return (
    <div className={cn("inline-flex", className)} data-testid={testId}>
      <Button
        size={size}
        variant={variant}
        busy={busy}
        disabled={disabled}
        className="rounded-r-none glass:rounded-r-none"
        onClick={main.onSelect}
      >
        {Icon ? <Icon aria-hidden="true" /> : null}
        {main.label}
      </Button>
      {rest.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size={size}
              variant={variant}
              disabled={disabled || busy}
              aria-label={menuLabel}
              data-testid={testId ? `${testId}-menu` : undefined}
              className="rounded-l-none border-l border-l-background/40 px-2 glass:rounded-l-none"
            >
              <ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {rest.map((a) => (
              <DropdownMenuItem key={a.key} onSelect={a.onSelect} className={a.destructive ? "text-destructive focus:text-destructive" : undefined}>
                {a.icon ? <a.icon aria-hidden="true" /> : null}
                {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
